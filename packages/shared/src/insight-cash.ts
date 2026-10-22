import type { InsightSources, InsightSink, InsightRef } from './insights'
import type { ForecastInput } from './forecasts'
import { smartPlanner } from './planner-engine'
import { dayOffset } from './insight-statistics'
import { sumCents } from './outflows'
import type { PlannerReport } from './planner'
export function cashInsights(
  s: InsightSources,
  input: ForecastInput,
  today: string,
  emit: InsightSink,
  prepared?: PlannerReport,
) {
  const plan = prepared ?? smartPlanner(s, input, today),
    report = plan.forecast
  const base = {
    area: 'cash_flow' as const,
    confidence: 'medium' as const,
    from: today,
    through: input.endDate,
    impactCents: null,
    changeBps: null,
    comparisonCents: null,
    action: 'Review dated cash, conditional paychecks and verified priorities in Smart Planner.',
    tradeoffs: [
      'Changes to payment dates require provider permission; do not postpone legal or essential obligations without verified terms.',
    ],
    limitations: [
      ...report.warnings,
      'Forecasts and allocations are conditional plans, not completed transactions.',
    ],
    module: 'planner',
  }
  const refsFor = (ids: string[]): InsightRef[] =>
    report.events
      .filter((e) => ids.includes(e.id) && e.reference)
      .flatMap((e) => {
        const r = e.reference!,
          type = r.type === 'bill_payment' ? 'bill' : r.type === 'debt_payment' ? 'debt' : r.type
        if (type === 'scenario') return []
        return [{ type, id: r.parentId ?? r.id, date: e.date }]
      })
  for (const item of plan.items.filter(
    (i) =>
      ['critical', 'essential'].includes(i.priority) &&
      !i.dismissed &&
      i.date <= dayOffset(today, 14) &&
      i.unfundedCents !== null &&
      i.unfundedCents > 0,
  ))
    emit({
      ...base,
      id: `essential-gap:${item.id}`,
      type: 'essential_gap',
      title: `${item.name}: near-term funding gap`,
      explanation: item.reason.join(' '),
      priority: item.confidence === 'confirmed' ? 'urgent' : 'important',
      confidence: item.confidence === 'confirmed' ? 'high' : 'medium',
      sampleCount: 1,
      currentCents: item.unfundedCents,
      refs: [
        ...(s.settingsId
          ? [{ type: 'forecast_settings' as const, id: s.settingsId, date: today }]
          : []),
        ...refsFor(item.sourceEventIds),
      ],
      method:
        'Existing Smart Planner priority, dated funding and unmet obligation; estimates retain conditional status',
    })
  const grouped = new Map<string, NonNullable<typeof report.smart>['risks']>()
  for (const risk of report.smart?.risks ?? [])
    if (risk.kind !== 'missing') grouped.set(risk.kind, [...(grouped.get(risk.kind) ?? []), risk])
  for (const risks of grouped.values()) {
    risks.sort((a, b) => a.date.localeCompare(b.date))
    const first = risks[0],
      risk = {
        ...first,
        eventIds: [...new Set(risks.flatMap((r) => r.eventIds))],
        confidence: risks.some((r) => r.confidence === 'incomplete')
          ? 'incomplete'
          : risks.some((r) => r.confidence === 'estimated')
            ? 'estimated'
            : 'confirmed',
      }

    emit({
      ...base,
      id: `cash-risk:${risk.id}`,
      type: 'cash_' + risk.kind,
      title:
        risks.length > 1
          ? `${risk.kind === 'negative' ? 'Projected cash below zero' : risk.kind === 'buffer' ? 'Projected buffer breaches' : 'Repeated ' + risk.kind.replaceAll('_', ' ')} · ${risks.length} dated occurrences`
          : risk.reason,
      explanation: `First ${risk.date}; last ${risks.at(-1)!.date}. ${risk.reason} Derived from the existing dated cash-flow calculation. Known subtotals are not a complete available-cash balance.`,
      priority:
        risk.kind === 'negative' &&
        risk.confidence === 'confirmed' &&
        risk.date <= dayOffset(today, 14)
          ? 'urgent'
          : ['negative', 'buffer', 'before_payday'].includes(risk.kind)
            ? 'important'
            : 'informational',
      confidence:
        risk.confidence === 'confirmed'
          ? 'high'
          : risk.confidence === 'incomplete'
            ? 'low'
            : 'medium',
      sampleCount: risks.length,
      currentCents: risk.amountCents,
      refs: [
        ...(s.settingsId
          ? [{ type: 'forecast_settings' as const, id: s.settingsId, date: today }]
          : []),
        ...refsFor(risk.eventIds),
      ],
      method:
        'Smart Cash Flow risk: ' +
        risk.kind +
        '; sample count is dated projected occurrences, not historical observations',
      action: risk.actions.join(' '),
    })
  }
  for (const r of s.planner?.records ?? []) {
    const v = r.values,
      ref: InsightRef = { type: 'planner', id: r.id, date: r.updatedAt.slice(0, 10) }
    if (v.kind === 'arrangement' && ['accepted', 'active'].includes(v.status)) {
      const future = v.installments.filter((i) => i.date >= today && i.date <= input.endDate),
        fees = sumCents(future.map((i) => sumCents([i.feesCents, i.interestCents])))
      if (future.length)
        emit({
          ...base,
          id: `split-cost:${r.id}`,
          type: 'split_cost',
          title: `${v.name}: installment costs`,
          explanation: `${future.length} scheduled installments in the horizon. Terms ${v.verification.verified ? 'verified' : 'unverified'}; original-obligation replacement follows existing Planner safeguards.`,
          priority: 'important',
          sampleCount: future.length,
          currentCents: fees,
          refs: [ref],
          method: 'Disclosed scheduled fees + interest; no APR inferred',
          action:
            'Review installments, verified replacement coverage and original bill in Smart Planner.',
        })
    }
    if (
      v.kind === 'advance' &&
      v.status === 'active' &&
      v.repaymentDate >= today &&
      v.repaymentDate <= input.endDate
    )
      emit({
        ...base,
        id: `advance-pressure:${r.id}`,
        type: 'advance_pressure',
        title: `${v.name}: borrowing repayment to reserve`,
        explanation:
          'Borrowed cash is separate from wages. Repayment and payroll-deduction treatment use the existing Planner; repeated advances are not a default solution to a gap.',
        priority: 'important',
        sampleCount: 1,
        currentCents: v.repaymentCents,
        comparisonCents: sumCents([v.feesCents, v.tipsCents, v.expeditedCents]),
        refs: [ref],
        method: 'Disclosed repayment and disclosed fee/tip/expedited costs, without annualization',
      })
  }
  const advances = (s.planner?.records ?? []).filter(
    (r) =>
      r.values.kind === 'advance' &&
      r.values.received &&
      ['active', 'completed'].includes(r.values.status) &&
      r.values.receivedDate >= dayOffset(today, -90) &&
      r.values.receivedDate <= today,
  )
  if (advances.length >= 3)
    emit({
      ...base,
      id: 'advance-cycle:' + today.slice(0, 7),
      type: 'advance_cycle',
      title: 'Repeated recorded advances in the last 90 days',
      explanation:
        'At least three recorded received advances. These are borrowed funds, not employer income. Review repayment overlap with essential obligations before considering further borrowing.',
      from: dayOffset(today, -90),
      through: today,
      priority: 'important',
      sampleCount: advances.length,
      currentCents: null,
      refs: advances.map((r) => ({ type: 'planner', id: r.id, date: r.updatedAt.slice(0, 10) })),
      method:
        'Count received active/completed advance records in the past 90 days; no assumed borrowing or inferred APR',
    })
  return plan
}
