import { plannerMoney } from './planner-display'
import type { ForecastEvent, ForecastSources } from './forecasts'
import type { PlannerInput, PlannerTarget, PlannerItem } from './planner'
export function plannerEventTarget(e: ForecastEvent, s: ForecastSources): PlannerTarget | null {
  const ref = e.reference
  if (!ref) return null
  if (ref.type === 'planner') {
    const p = s.planner?.records.find((r) => r.id === ref.id)?.values
    return p && 'target' in p ? p.target : null
  }
  if (ref.type === 'bill') {
    const bill = s.bills.find((b) => b.id === ref.id),
      period = bill?.periods.find((p) => p.dueDate === (e.originalDate ?? e.date))
    return period
      ? { kind: 'bill_period', id: period.id, parentId: bill!.id }
      : { kind: 'bill', id: ref.id, parentId: null }
  }
  if (ref.type === 'bill_payment') {
    const b = s.bills.find((b) => b.id === ref.parentId),
      p = b?.payments.find((p) => p.id === ref.id)
    return p ? { kind: 'bill_period', id: p.periodId, parentId: b!.id } : null
  }
  if (ref.type === 'debt' || ref.type === 'debt_payment')
    return { kind: 'debt', id: ref.parentId ?? ref.id, parentId: null }
  if (ref.type === 'expense') return { kind: 'expense', id: ref.id, parentId: null }
  return null
}
export function samePlannerTarget(a: PlannerTarget | null, b: PlannerTarget | null) {
  return !!a && !!b && a.kind === b.kind && a.id === b.id
}
export function plannerPriority(e: ForecastEvent, s: ForecastSources, today: string) {
  const target = plannerEventTarget(e, s),
    policies = (s.planner?.records ?? [])
      .map((r) => r.values)
      .filter((p): p is Extract<PlannerInput, { kind: 'priority' }> => p.kind === 'priority')
  const policy =
    policies.find((p) => samePlannerTarget(p.target, target)) ??
    policies.find((p) => p.target.kind === 'bill' && p.target.id === target?.parentId)
  const valid =
    policy?.verification.verified &&
    (!policy.verification.validThrough || policy.verification.validThrough >= today)
  const debt = target?.kind === 'debt' ? s.debts.find((d) => d.id === target.id) : null
  const text = e.name.toLowerCase(),
    reasons: string[] = []
  let priority: PlannerItem['priority'] =
    /rent|housing|mortgage|child support/.test(text) || debt?.accountType === 'child_support'
      ? 'critical'
      : /electric|water|gas|utility|childcare|medical|health|grocer|food|transport|phone|internet|insurance/.test(
            text,
          )
        ? 'essential'
        : e.id === 'extra-debt' || e.id.startsWith('variable-spending:')
          ? 'optional'
          : 'important'
  reasons.push(
    priority === 'critical'
      ? 'Suggested housing-stability priority, not a legal consequence claim.'
      : priority === 'essential'
        ? 'Suggested essential daily-living/work priority based on the obligation label.'
        : 'Financial commitment; due date alone does not establish a universal ranking.',
  )
  if (policy) {
    priority = policy.priority
    reasons.push('Household priority override: ' + policy.name + '. ' + policy.notes)
  }
  if (policy?.essential && priority !== 'critical') priority = 'essential'
  if (debt?.interestRateApr !== null && debt?.interestRateApr !== undefined)
    reasons.push(
      `Recorded APR ${debt.interestRateApr}%; it does not override essential or legal priorities.`,
    )
  if (valid && policy?.lateFeeCents !== null && policy?.lateFeeCents !== undefined)
    reasons.push(
      `Verified late fee ${plannerMoney(policy.lateFeeCents)}. Grace periods are not automatically used to move the due date.`,
    )
  if (policy?.legalOrder && valid) {
    priority = 'critical'
    reasons.push('Verified court/legal obligation. Do not assume it can be skipped or deferred.')
  }
  if (policy?.consequence !== 'none' && policy?.consequence && valid) {
    reasons.push(
      'User-verified consequence: ' +
        policy.consequence +
        '; source: ' +
        policy.verification.source,
    )
    if (['housing', 'judgment', 'health'].includes(policy.consequence)) priority = 'critical'
  }
  if (policy && !valid)
    reasons.push(
      'Consequence/grace/partial-payment evidence is missing or expired; reverify terms.',
    )
  if (debt && ['collection', 'collections'].includes(debt.accountType))
    reasons.push(
      'A collection is not automatically low priority; legal deadlines must be verified.',
    )
  return {
    target,
    priority,
    reason: reasons,
    consequence: valid && policy?.consequence !== 'none' ? (policy?.consequence ?? null) : null,
    partialAllowed: !!valid && policy?.partialAllowed === 'verified',
    accountId: policy?.paymentAccountId ?? null,
    date: valid && policy?.deadline ? policy.deadline : e.date,
  }
}
