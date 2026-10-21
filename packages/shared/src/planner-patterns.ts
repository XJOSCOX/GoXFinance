import type { ForecastSources } from './forecasts'
import type { PlannerReport } from './planner'
import { sumCents } from './outflows'
export function plannerPatterns(s: ForecastSources, today: string): PlannerReport['patterns'] {
  const patterns: PlannerReport['patterns'] = []
  for (const b of s.bills) {
    const periods = b.periods
      .filter(
        (p) =>
          p.dueDate < today &&
          p.amountCents !== null &&
          ['paid', 'overpaid', 'credited'].includes(p.paymentStatus),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    if (periods.length >= 3)
      patterns.push({
        name: b.name + ' completed bill average',
        amountCents: Math.round(
          sumCents(periods.slice(-12).map((p) => p.amountCents!)) / Math.min(12, periods.length),
        ),
        sampleCount: Math.min(12, periods.length),
        confidence: periods.length >= 6 ? 'medium' : 'low',
        basis:
          'Known actual completed periods only. Averages do not replace saved estimates or current bills.',
      })
    // Compare recorded actuals only; this is descriptive, never an automatic bill update.
    if (periods.length >= 6) {
      const recent = periods.slice(-3),
        prior = periods.slice(-6, -3),
        difference = Math.round(
          (sumCents(recent.map((p) => p.amountCents!)) -
            sumCents(prior.map((p) => p.amountCents!))) /
            3,
        )
      patterns.push({
        name: b.name + ' recent change',
        amountCents: difference,
        sampleCount: 6,
        confidence: 'low',
        basis:
          'Last three completed actual bills versus the preceding three. Signed change; no causal or future-price claim.',
      })
    }
    if (periods.length >= 24) {
      const seasonal = periods.filter((p) => p.dueDate.slice(5, 7) === today.slice(5, 7))
      if (new Set(seasonal.map((p) => p.dueDate.slice(0, 4))).size >= 2)
        patterns.push({
          name: b.name + ' same-month history',
          amountCents: Math.round(sumCents(seasonal.map((p) => p.amountCents!)) / seasonal.length),
          sampleCount: seasonal.length,
          confidence: 'low',
          basis:
            'At least 24 completed periods and the same calendar month in at least two years. Limited seasonal comparison, not a forecast.',
        })
    }
    const timing = b.payments.filter(
      (p) =>
        p.status === 'completed' &&
        p.paymentDate <= today &&
        b.periods.some((x) => x.id === p.periodId),
    )
    if (timing.length >= 3)
      patterns.push({
        name: b.name + ' payment timing',
        amountCents: null,
        sampleCount: timing.length,
        confidence: timing.length >= 6 ? 'medium' : 'low',
        basis: `${timing.filter((p) => p.paymentDate > b.periods.find((x) => x.id === p.periodId)!.dueDate).length} of ${timing.length} completed payments were after due dates. Prior late payments never establish permission to pay late again.`,
      })
  }
  for (const category of s.categories) {
    const months = new Map<string, number>()
    for (const e of s.expenses.filter(
      (e) => !e.voided && e.transactionDate.slice(0, 7) < today.slice(0, 7),
    ))
      for (const a of e.allocations.filter((a) => a.categoryId === category.id))
        months.set(
          e.transactionDate.slice(0, 7),
          sumCents([months.get(e.transactionDate.slice(0, 7)) ?? 0, a.amountCents]),
        )
    if (months.size >= 3)
      patterns.push({
        name: category.name + ' recorded-month average',
        amountCents: Math.round(sumCents([...months.values()]) / months.size),
        sampleCount: months.size,
        confidence: months.size >= 6 ? 'medium' : 'low',
        basis:
          'Observed completed months with recorded purchases; missing months are not assumed zero. Budget limits remain separate.',
      })
  }
  for (const src of s.income.sources) {
    const tx = s.income.transactions.filter(
      (t) =>
        t.sourceId === src.id &&
        t.status === 'confirmed' &&
        t.depositDate &&
        t.depositDate <= today,
    )
    if (tx.length >= 3)
      patterns.push({
        name: src.name + ' receipt timing',
        amountCents: null,
        sampleCount: tx.length,
        confidence: tx.length >= 6 ? 'medium' : 'low',
        basis: `${tx.filter((t) => t.depositDate! > t.payDate).length} of ${tx.length} confirmed deposits arrived after the recorded payday. This never establishes that late payment is harmless.`,
      })
  }
  const arrangements = (s.planner?.records ?? []).filter(
    (r) =>
      r.values.kind === 'arrangement' &&
      r.values.verification.verified &&
      ['accepted', 'active', 'completed'].includes(r.values.status),
  )
  if (arrangements.length >= 3)
    patterns.push({
      name: 'Recorded split / installment usage',
      amountCents: null,
      sampleCount: arrangements.length,
      confidence: 'low',
      basis:
        'Three or more verified recorded arrangements. Past terms do not imply another arrangement is available or still valid.',
    })
  return patterns
}
