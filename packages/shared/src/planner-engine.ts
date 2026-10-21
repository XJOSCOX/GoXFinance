import type { PlannerTarget } from './planner'
import { plannerMoney } from './planner-display'
import { budgetSpending } from './budget-calculations'
import { forecast } from './forecast-calculations'
import { sumCents } from './outflows'
import {
  plannerPriorities,
  type PlannerInput,
  type PlannerFunding,
  type PlannerItem,
  type PlannerReport,
} from './planner'
import type { ForecastSources, ForecastInput } from './forecasts'
import { plannerPriority, samePlannerTarget } from './planner-priorities'
import { plannerPatterns } from './planner-patterns'
export function smartPlanner(
  s: ForecastSources,
  input: ForecastInput,
  today: string,
): PlannerReport {
  const report = forecast(s, { ...input, includeSettlements: true }, today),
    records = s.planner?.records ?? [],
    warnings = [...report.warnings]
  const prefs = records
    .map((r) => r.values)
    .filter((p) => p.kind === 'preferences')
    .at(-1)
  const allocations = records
    .map((r) => r.values)
    .filter(
      (p): p is Extract<PlannerInput, { kind: 'allocation' }> =>
        p.kind === 'allocation' && p.status === 'accepted',
    )
  const reserves = allocations.filter(
    (a) => a.purpose !== 'obligation' && a.date >= input.startDate && a.date <= input.endDate,
  )
  let budgetReserve = 0
  if (prefs?.useBudgetReserves) {
    for (const b of s.budgets ?? []) {
      if (
        b.status !== 'active' ||
        b.month !== input.startDate.slice(0, 7) ||
        b.responsibleMemberId !== null
      )
        continue
      const spent = budgetSpending(s.expenses, s.bills, b.month, null, today, s.refunds)
      for (const l of b.limits) {
        const category = s.categories.find((c) => c.id === l.categoryId)
        if (
          !category ||
          !/grocer|food|transport|health|household supplies/i.test(category.name) ||
          s.bills.some((x) => x.categoryId === l.categoryId) ||
          reserves.some((a) => a.categoryId === l.categoryId)
        )
          continue
        budgetReserve = sumCents([
          budgetReserve,
          Math.max(
            0,
            l.amountCents - (spent.find((x) => x.categoryId === l.categoryId)?.actualCents ?? 0),
          ),
        ])
      }
    }
    warnings.push(
      'Budget reserves use remaining household food/transport/health/supplies limits for the starting month only; categories already covered by bills or explicit reserves are excluded. Limits are not cash payments.',
    )
  }
  const baseReserve = sumCents([
    input.smart?.bufferCents ?? 0,
    prefs?.essentialReserveCents ?? 0,
    budgetReserve,
    input.planning?.essentialReserveCents ?? 0,
  ])
  const reserve = sumCents([baseReserve, ...reserves.map((a) => a.amountCents)])
  const opening = input.smart?.opening
  const funding: PlannerFunding[] = opening
    ? opening.source === 'selected_accounts'
      ? opening.accounts.map((a) => ({
          id: 'cash:' + a.accountId,
          name: s.cashAccounts?.find((c) => c.id === a.accountId)?.name ?? 'Selected cash account',
          date: input.startDate,
          amountCents: a.availableCents,
          remainingCents: Math.max(0, a.availableCents),
          accountId: a.accountId,
          status: 'confirmed_cash' as const,
        }))
      : [
          {
            id: 'cash',
            name: 'Confirmed available household cash',
            date: input.startDate,
            amountCents: opening.amountCents,
            remainingCents: Math.max(0, opening.amountCents),
            accountId: null,
            status: 'confirmed_cash',
          },
        ]
    : []
  // Actual movements after an older confirmation are not a second income forecast.
  const subsequent = sumCents(
    report.events
      .filter((e) => !e.estimated && e.date <= today)
      .map((e) => (e.direction === 'in' ? 1 : -1) * (e.amountCents ?? 0)),
  )
  if (funding.length === 1)
    funding[0].remainingCents = Math.max(0, sumCents([funding[0].remainingCents, subsequent]))
  else if (subsequent !== 0) {
    warnings.push(
      'Subsequent actual cash activity has no verified account attribution. Update account balances before account-level allocation.',
    )
    for (const f of funding) f.remainingCents = 0
  }
  const negativeCash = Math.max(0, -sumCents(funding.map((f) => Math.min(0, f.amountCents))))
  if (negativeCash)
    warnings.push(
      'Negative available cash is an existing deficit, not an overdraft limit or funding source.',
    )
  let toHold = sumCents([
    baseReserve,
    negativeCash,
    ...reserves.filter((a) => !a.fundingEventId).map((a) => a.amountCents),
  ])
  for (const f of funding) {
    const held = Math.min(f.remainingCents, toHold)
    f.remainingCents -= held
    toHold -= held
  }
  if (toHold > 0)
    warnings.push(
      `Known cash is ${plannerMoney(toHold)} short of the safety buffer and essential/accepted reserves before obligations.`,
    )
  for (const e of report.events.filter(
    (e) =>
      e.direction === 'in' &&
      e.estimated &&
      (e.kind === 'expected_income' || e.id === 'hypothetical-advance'),
  ))
    funding.push({
      id: e.id,
      name: e.name,
      date: e.date,
      amountCents: e.amountCents ?? 0,
      remainingCents: e.amountCents ?? 0,
      accountId: null,
      status:
        e.id === 'hypothetical-advance'
          ? 'hypothetical_borrowing'
          : e.classification === 'documented_payroll'
            ? 'documented_paycheck'
            : e.classification === 'payroll_forecast'
              ? 'forecast_paycheck'
              : 'assumed_paycheck',
    })
  for (const r of reserves.filter((a) => a.fundingEventId)) {
    const lot = funding.find((f) => f.id === r.fundingEventId && f.date <= r.date)
    const available = lot ? Math.min(lot.remainingCents, r.amountCents) : 0
    if (lot) lot.remainingCents -= available
    if (available < r.amountCents) {
      toHold = sumCents([toHold, r.amountCents - available])
      warnings.push(`Accepted reserve ${r.name} is not fully funded from its selected paycheck.`)
    }
  }
  const confirmedSpendable = opening
    ? sumCents(funding.filter((f) => f.status === 'confirmed_cash').map((f) => f.remainingCents))
    : null
  const matches = (a: PlannerTarget | null, b: PlannerTarget | null) =>
    samePlannerTarget(a, b) ||
    (a?.kind === 'bill' && b?.kind === 'bill_period' && a.id === b.parentId)
  const overrideUsed = new Map<string, number>()
  const dismissed = records
    .map((r) => r.values)
    .filter(
      (p): p is Extract<PlannerInput, { kind: 'allocation' }> =>
        p.kind === 'allocation' && p.status === 'dismissed',
    )
  const items: PlannerItem[] = report.events
    .filter(
      (e) =>
        e.direction === 'out' &&
        e.estimated &&
        e.kind !== 'payroll_deduction' &&
        e.amountCents !== 0,
    )
    .map((e) => {
      const p = plannerPriority(e, s, today)
      const override = allocations.find(
        (a) => a.purpose === 'obligation' && a.date === p.date && matches(a.target, p.target),
      )
      if (override && !p.consequence && !p.reason.some((r) => r.startsWith('Verified court/legal')))
        p.priority = override.priority
      return {
        ...p,
        id: e.id,
        name: e.name,
        amountCents: e.amountCents,
        sourceEventIds: [e.id],
        recommendedCents: 0,
        unfundedCents: e.amountCents,
        funding: [],
        confidence: report.incomplete ? 'incomplete' : 'estimated',
        dismissed: dismissed.some((a) => a.date === p.date && matches(a.target, p.target)),
      }
    })
  items.sort(
    (a, b) =>
      plannerPriorities.indexOf(a.priority) - plannerPriorities.indexOf(b.priority) ||
      a.date.localeCompare(b.date) ||
      Number(a.id.startsWith('hypothetical')) - Number(b.id.startsWith('hypothetical')) ||
      a.id.localeCompare(b.id),
  )
  for (const item of items) {
    if (item.amountCents === null || item.dismissed) {
      if (item.dismissed)
        item.reason.push(
          'Recommendation dismissed by the user; the real obligation remains unpaid and visible.',
        )
      continue
    }
    const override = allocations.find(
      (a) => a.purpose === 'obligation' && a.date === item.date && matches(a.target, item.target),
    )
    let needed = Math.min(
      item.amountCents,
      override
        ? Math.max(0, override.amountCents - (overrideUsed.get(override.name + override.date) ?? 0))
        : item.amountCents,
    )
    if (override) item.reason.push('Accepted allocation override: ' + override.explanation)
    const ordered = [...funding].sort(
      (a, b) =>
        Number(a.status === 'confirmed_cash') - Number(b.status === 'confirmed_cash') ||
        b.date.localeCompare(a.date),
    )
    for (const f of ordered) {
      if (
        f.date > item.date ||
        f.remainingCents <= 0 ||
        (override?.fundingEventId && f.id !== override.fundingEventId)
      )
        continue
      if (
        item.accountId &&
        f.accountId !== item.accountId &&
        !(override?.accountId === item.accountId && override.fundingEventId === f.id)
      )
        continue
      if (
        !item.accountId &&
        funding.filter((f) => f.accountId && f.status === 'confirmed_cash').length > 1
      ) {
        item.reason.push(
          'Payment account is unknown. No instant transfers between separate accounts are assumed.',
        )
        continue
      }
      const amount = Math.min(needed, f.remainingCents)
      if (!amount) continue
      f.remainingCents -= amount
      needed -= amount
      item.recommendedCents = sumCents([item.recommendedCents, amount])
      item.funding.push({
        id: f.id,
        name: f.name,
        date: f.date,
        amountCents: amount,
        status: f.status,
      })
      if (!needed) break
    }
    if (override)
      overrideUsed.set(
        override.name + override.date,
        sumCents([overrideUsed.get(override.name + override.date) ?? 0, item.recommendedCents]),
      )
    item.unfundedCents = item.amountCents - item.recommendedCents
    if (item.unfundedCents > 0) {
      const later = funding.find((f) => f.date > item.date && f.remainingCents > 0)
      item.reason.push(
        later
          ? `Additional funds may arrive ${later.date}, after this deadline; ${plannerMoney(item.unfundedCents)} remain unfunded by the due date.`
          : 'Known funds cannot cover this obligation by its deadline.',
      )
      if (!item.partialAllowed && item.recommendedCents > 0)
        item.reason.push(
          'A partial reserve is not a sufficient payment unless the provider confirms acceptance.',
        )
    }
    if (!item.accountId)
      item.reason.push(
        'Funding is a planning reserve; the actual debit account must still be confirmed.',
      )
  }
  const unfunded = sumCents([toHold, ...items.map((i) => i.unfundedCents ?? 0)]),
    critical = sumCents(
      items.filter((i) => i.priority === 'critical').map((i) => i.unfundedCents ?? 0),
    )
  const advances = records
      .map((r) => r.values)
      .filter(
        (p): p is Extract<PlannerInput, { kind: 'advance' }> =>
          p.kind === 'advance' && p.status === 'active',
      ),
    fees = sumCents([
      input.planning?.hypotheticalAdvance?.feesCents ?? 0,
      ...advances.map((a) => sumCents([a.feesCents, a.tipsCents, a.expeditedCents])),
      ...records.flatMap((r) =>
        r.values.kind === 'arrangement' && ['accepted', 'active'].includes(r.values.status)
          ? r.values.installments.map((i) => sumCents([i.feesCents, i.interestCents]))
          : [],
      ),
    ])
  const insights: PlannerReport['insights'] = []
  if (unfunded || !opening)
    insights.push({
      title: 'No fully funded solution in the known data',
      reason: !opening
        ? 'Available cash has not been confirmed.'
        : `${plannerMoney(unfunded)} remain unfunded by deadlines after buffers/reserves.`,
      actions: [
        'Verify missing balances, payroll and obligation amounts',
        'Review optional spending and extra debt-payment assumptions',
        'Contact providers early about documented hardship/installment options; do not assume approval',
      ],
    })
  for (const pay of report.events.filter((e) => e.kind === 'expected_income')) {
    const due = advances.filter((a) => a.repaymentDate === pay.date)
    const total = sumCents(due.map((a) => a.repaymentCents))
    if (due.length > 1 || (pay.amountCents !== null && total > pay.amountCents * 0.25))
      insights.push({
        title: 'Advance repayment pressure on payday',
        reason: `${due.length} repayments total ${plannerMoney(total)} on ${pay.date}; 25% of expected take-home is a review threshold, not a provider rule.`,
        actions: [
          'Verify payroll deduction versus bank debit',
          'Review rent and essential bills due nearby',
          'Do not assume rescheduling or partial payments are permitted',
        ],
      })
  }
  for (const a of advances)
    if (
      advances.some(
        (b) =>
          b !== a &&
          Math.abs(Date.parse(a.receivedDate) - Date.parse(b.repaymentDate)) <= 7 * 86400000,
      )
    )
      insights.push({
        title: 'Overlapping advance cycles',
        reason: `${a.provider} receipt is within seven days of another repayment. The reason for borrowing is unknown.`,
        actions: [
          'Review cumulative fees and repayment commitments',
          'Compare reduced optional spending and provider hardship options',
          'No new borrowing is automatically recommended',
        ],
      })
  return {
    forecast: report,
    items,
    funding,
    reservedCents: reserve,
    confirmedSpendableCents: confirmedSpendable,
    unfundedCents: unfunded,
    unfundedReservesCents: toHold,
    unfundedCriticalCents: critical,
    unknownCount: items.filter((i) => i.amountCents === null).length,
    feesCents: fees,
    warnings: [...new Set(warnings)],
    insights,
    patterns: plannerPatterns(s, today),
    fullyFunded:
      !!opening &&
      !report.incomplete &&
      unfunded === 0 &&
      report.shortfalls.length === 0 &&
      items.every((i) => i.amountCents !== null) &&
      toHold === 0,
  }
}
