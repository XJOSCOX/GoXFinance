import type { ForecastWarnings } from './forecast-warnings'
import type { ForecastSources, ForecastEvent, ForecastInput } from './forecasts'
import type { PlannerInput } from './planner'
import { paymentNetCents, sumCents } from './outflows'
import { debtObligationGroups } from './debt-calculations'
import { plannerEventTarget } from './planner-priorities'
export type DebtPaymentPlan = Extract<PlannerInput, { kind: 'debt_plan' }>
export function debtPlanIds(v: DebtPaymentPlan, s: ForecastSources) {
  return (
    debtObligationGroups(s.debts)
      .find((g) => g.some((d) => d.id === v.target.id))
      ?.map((d) => d.id) ?? [v.target.id]
  )
}
export function debtPlanProgress(v: DebtPaymentPlan, s: ForecastSources, today: string) {
  const ids = debtPlanIds(v, s),
    payments = [
      ...new Map(
        s.payments
          .filter(
            (p) =>
              ids.includes(p.debtId) && p.paymentDate >= v.startDate && p.paymentDate <= v.deadline,
          )
          .map((p) => [p.id, p]),
      ).values(),
    ]
  const paidCents = sumCents(
    payments
      .filter((p) => p.paymentStatus === 'completed' && p.paymentDate <= today)
      .map((p) => paymentNetCents(p, today)),
  )
  return {
    paidCents,
    remainingCents: v.amountCents === null ? null : Math.max(0, v.amountCents - paidCents),
  }
}
export function debtPlanProblem(
  v: DebtPaymentPlan,
  s: ForecastSources,
  today: string,
): string | null {
  if (v.status !== 'confirmed') return 'Confirm the amount and schedule to include this plan.'
  if (!s.debts.some((d) => d.id === v.target.id && !d.isArchived))
    return 'The debt is missing or archived; review this plan.'
  if (
    v.replaceOriginal &&
    (!v.verification.verified ||
      (v.verification.validThrough && v.verification.validThrough < today))
  )
    return 'Replacement terms need current verification.'
  if (v.mode === 'linked_bill') {
    const b = s.bills.find((b) => b.id === v.billId)
    if (
      !b ||
      b.status !== 'active' ||
      b.linkedDebtId !== v.target.id ||
      b.updatedAt !== v.billUpdatedAt
    )
      return 'The linked bill changed; review and reconfirm the monthly schedule.'
  }
  if (v.settlementId) {
    const offer = s.offers.find((o) => o.id === v.settlementId)
    if (
      !offer ||
      offer.debtId !== v.target.id ||
      offer.revision !== v.settlementRevision ||
      ['cancelled', 'rejected', 'expired', 'completed'].includes(offer.status)
    )
      return 'The settlement offer changed or is no longer active; review this plan.'
    if (v.replaceOriginal && (offer.status !== 'accepted' || !offer.writtenConfirmed))
      return 'The settlement must be accepted and confirmed in writing before replacing original terms.'
  }
  return null
}
// A personal target adds only the extra amount needed beyond existing dated obligations.
// It does not forgive principal, create payments, or move contractual deadlines.
export function addDebtPlanGoals(
  s: ForecastSources,
  v: ForecastInput,
  today: string,
  events: ForecastEvent[],
  warnings: ForecastWarnings,
  add: (e: ForecastEvent) => void,
) {
  for (const record of s.planner?.records ?? []) {
    const p = record.values
    if (p.kind !== 'debt_plan' || p.status !== 'confirmed') continue
    const problem = debtPlanProblem(p, s, today)
    if (problem) {
      warnings.push(p.name + ': ' + problem)
      continue
    }
    if (p.mode !== 'pay_by_date' || p.deadline > v.endDate) continue
    const ids = debtPlanIds(p, s),
      remaining = debtPlanProgress(p, s, today).remainingCents!
    const scheduled = events.filter((e) => {
      const target = plannerEventTarget(e, s)
      return (
        e.estimated &&
        e.direction === 'out' &&
        e.date >= p.startDate &&
        e.date <= (p.deadline < v.startDate ? v.startDate : p.deadline) &&
        target?.kind === 'debt' &&
        ids.includes(target.id)
      )
    })
    if (scheduled.some((e) => e.amountCents === null))
      warnings.push(
        'Unknown existing payment coverage for ' +
          p.name +
          '; the dated goal remains an additional amount until reconciled.',
      )
    const covered = sumCents(scheduled.map((e) => e.amountCents ?? 0)),
      amount = Math.max(0, remaining - covered)
    if (amount)
      add({
        id: 'debt-goal:' + record.id,
        date: p.deadline < v.startDate ? v.startDate : p.deadline,
        originalDate: p.deadline,
        name: p.name,
        amountCents: amount,
        direction: 'out',
        kind: 'debt_repayment',
        estimated: true,
        reference: { type: 'planner', id: record.id },
        classification: 'estimated_obligation',
        confidence: 'estimated',
        basis:
          'Confirmed personal payment goal. Completed payments and existing obligations by the deadline count once. This is not a completed payment or verified debt payoff.',
      })
  }
}
