import type { InsightSources, InsightSink } from './insights'
import { debtObligationGroups, representativeDebtBalance } from './debt-calculations'
import { settlementProgress } from './debt-planning'
import { dayOffset, roundedRatio } from './insight-statistics'
import { sumCents } from './outflows'
export function debtInsights(s: InsightSources, today: string, emit: InsightSink) {
  const base = {
    area: 'debt' as const,
    confidence: 'medium' as const,
    from: dayOffset(today, -90),
    through: today,
    impactCents: null,
    changeBps: null,
    action:
      'Review verified balances and compare payoff strategies in Debt planning after protecting essentials and reserves.',
    tradeoffs: [
      'Court-ordered, housing and essential obligations take precedence over optional extra debt payments.',
    ],
    limitations: [
      'Payments do not prove principal reduction. Unknown APRs are never assumed zero.',
    ],
    module: 'debt-planning',
  }
  for (const group of debtObligationGroups(s.debts)) {
    const d = representativeDebtBalance(group),
      refs = [{ type: 'debt' as const, id: d.id, date: d.updatedAt.slice(0, 10) }]
    const history = s.balances
      .filter(
        (b) =>
          b.debtId === d.id &&
          b.householdId === d.householdId &&
          ['creditor_statement', 'reconciliation'].includes(b.source) &&
          b.effectiveDate <= today,
      )
      .sort(
        (a, b) =>
          a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt),
      )
    const observations = [...new Map(history.map((b) => [b.effectiveDate, b])).values()].slice(-2)
    if (observations.length === 2)
      emit({
        ...base,
        id: `debt-trend:${d.id}`,
        type: 'verified_debt_trend',
        title: `${d.creditorName}: verified balance ${observations[1].balanceCents > observations[0].balanceCents ? 'increased' : 'change'}`,
        explanation:
          'Two distinct dated creditor/reconciliation balance observations. No principal reduction is inferred from payment totals.',
        priority:
          observations[1].balanceCents > observations[0].balanceCents
            ? 'important'
            : 'informational',
        confidence: 'high',
        from: observations[0].effectiveDate,
        through: observations[1].effectiveDate,
        sampleCount: 2,
        currentCents: observations[1].balanceCents,
        comparisonCents: observations[0].balanceCents,
        refs: observations.map((b) => ({ type: 'debt_balance', id: b.id, date: b.effectiveDate })),
        method: 'Latest verified balance minus earlier verified balance, without extrapolation',
      })
    if (
      d.interestRateApr !== null &&
      Number(d.interestRateApr) >= 20 &&
      d.currentBalanceCents !== null &&
      d.currentBalanceCents > 0
    )
      emit({
        ...base,
        id: `apr-pressure:${d.id}`,
        type: 'apr_pressure',
        title: `${d.creditorName}: reported APR ${d.interestRateApr}%`,
        explanation:
          'A reported APR at or above 20% warrants reviewing interest pressure and comparing avalanche/snowball. No interest savings or affordable extra payment is assumed.',
        priority: 'improvement',
        sampleCount: 1,
        refs,
        currentCents: d.currentBalanceCents,
        comparisonCents: null,
        method: 'Reported APR ≥ 20%; balance confidence remains ' + d.confidence,
      })
    if (
      d.accountType === 'credit_card' &&
      d.confidence === 'confirmed' &&
      d.balanceVerifiedAt &&
      d.balanceVerifiedAt.slice(0, 10) <= today &&
      d.currentBalanceCents !== null &&
      d.creditLimitCents !== null &&
      d.creditLimitCents > 0
    )
      emit({
        ...base,
        id: `utilization:${d.id}`,
        type: 'credit_utilization',
        title: `${d.creditorName}: recorded utilization`,
        explanation:
          'Confirmed recorded balance divided by the reported credit limit as of the balance observation. Not a credit-score prediction or live creditor balance.',
        priority: 'informational',
        sampleCount: 1,
        refs,
        currentCents: d.currentBalanceCents,
        comparisonCents: d.creditLimitCents,
        changeBps: roundedRatio(d.currentBalanceCents, d.creditLimitCents, 10000),
        method: 'Confirmed balance / reported positive limit; basis points rounded half-up',
      })
    const payments = s.payments.filter(
      (p) =>
        group.some((a) => a.id === p.debtId) &&
        p.paymentStatus === 'completed' &&
        p.paymentDate >= base.from &&
        p.paymentDate <= today,
    )
    if (
      payments.length >= 2 &&
      payments.every(
        (p) =>
          p.principalAmountCents !== null &&
          p.interestAmountCents !== null &&
          p.feesAmountCents !== null,
      )
    ) {
      const costs = sumCents(
          payments.map((p) => sumCents([p.interestAmountCents!, p.feesAmountCents!])),
        ),
        principal = sumCents(payments.map((p) => p.principalAmountCents!))
      if (costs > principal)
        emit({
          ...base,
          id: `debt-costs:${d.id}`,
          type: 'debt_costs',
          title: `${d.creditorName}: costs exceed reported principal`,
          explanation:
            'Reported interest and fees exceed reported principal allocations in completed payments. Verify allocations and creditor statements; refunds may change the interpretation.',
          priority: 'important',
          sampleCount: payments.length,
          refs: [
            ...refs,
            ...payments.map((p) => ({
              type: 'debt_payment' as const,
              id: p.id,
              date: p.paymentDate,
            })),
          ],
          currentCents: costs,
          comparisonCents: principal,
          method:
            'Known interest + fee allocations compared with known principal allocations; no inferred balance change',
        })
    }
  }
  for (const o of s.offers.filter(
    (o) => o.writtenConfirmed && ['accepted', 'offered', 'negotiating'].includes(o.status),
  )) {
    const progress = settlementProgress(o, s.payments, today),
      due = o.schedule.filter(
        (p) =>
          p.dueDate <= dayOffset(today, 14) &&
          progress.schedule.some((x) => x.id === p.id && x.remainingCents > 0),
      )
    if (!due.length) continue
    emit({
      ...base,
      id: `settlement-deadline:${o.id}`,
      type: 'settlement_deadline',
      title: `${o.creditor}: written settlement schedule to review`,
      explanation:
        o.status === 'accepted'
          ? 'Accepted written settlement has remaining scheduled installments due within 14 days or overdue.'
          : 'A written offer has a dated proposed installment; acceptance and affordability still require review.',
      priority: o.status === 'accepted' ? 'urgent' : 'important',
      confidence: 'high',
      sampleCount: due.length,
      refs: [{ type: 'settlement', id: o.id, date: o.offerDate }],
      currentCents: progress.remainingCents,
      comparisonCents: null,
      method:
        'Written offer status and remaining linked-payment installment schedule; no legal consequences inferred',
      action:
        'Review written terms, expiration and Smart Planner funding before confirming any payment.',
    })
  }
}
