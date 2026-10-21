import type { PayrollStatement, PayrollProfileInput } from './payroll'
import { payrollRound, payrollSum, payrollReconciliation } from './payroll-arithmetic'
export type PayrollObservation = {
  statement: PayrollStatement
  reviewedAt: string
  sourceId?: string
}
export function hasPayrollBonus(s: PayrollStatement) {
  return s.lines.some(
    (l) =>
      l.side === 'earnings' &&
      l.code === 'bonus' &&
      l.currentCents !== null &&
      l.currentCents !== 0,
  )
}
const earningCodes = ['disability', 'insurance', 'other_earning', 'pretax_benefit'] as const
export function payrollLearningSuggestions(
  history: PayrollObservation[],
  profile: PayrollProfileInput,
  asOf = new Date().toISOString(),
) {
  const samples = history.filter(
      (h) =>
        (!h.sourceId || h.sourceId === profile.sourceId) &&
        h.reviewedAt < asOf &&
        payrollReconciliation(h.statement).length === 0 &&
        !hasPayrollBonus(h.statement),
    ),
    recurring: NonNullable<PayrollProfileInput['recurringEarnings']> = []
  const labels = new Set(
    samples.flatMap((h) =>
      h.statement.lines
        .filter(
          (l) =>
            l.side === 'earnings' &&
            earningCodes.includes(l.code as (typeof earningCodes)[number]) &&
            l.hoursHundredths === null &&
            l.worked !== true,
        )
        .map((l) => l.label),
    ),
  )
  for (const label of labels) {
    const matches = samples.map((h) =>
      h.statement.lines.filter((l) => l.side === 'earnings' && l.label === label),
    )
    if (
      samples.length < 3 ||
      matches.some(
        (ls) => ls.length !== 1 || ls[0].currentCents === null || ls[0].currentCents! <= 0,
      )
    )
      continue
    const first = matches[0][0]
    if (
      matches.every((ls) => ls[0].currentCents === first.currentCents) &&
      !profile.recurringEarnings?.some((r) => r.label.toLowerCase() === label.toLowerCase())
    )
      recurring.push({
        code: first.code as (typeof earningCodes)[number],
        label,
        amountCents: first.currentCents!,
        enabled: true,
      })
  }
  const deductions: PayrollProfileInput['rules'] = []
  for (const code of new Set(
    samples.flatMap((h) =>
      h.statement.lines
        .filter(
          (l) =>
            l.side === 'deduction' &&
            !['unknown', 'federal', 'social_security', 'medicare', 'state', 'local'].includes(
              l.code,
            ),
        )
        .map((l) => l.code),
    ),
  )) {
    if (samples.length < 3 || profile.rules.some((r) => r.code === code)) continue
    const observations = samples.map((h) => {
      const lines = h.statement.lines.filter((l) => l.side === 'deduction' && l.code === code)
      const excluded = payrollSum(
        h.statement.lines
          .filter(
            (l) =>
              l.side === 'earnings' &&
              earningCodes.includes(l.code as (typeof earningCodes)[number]) &&
              l.hoursHundredths === null,
          )
          .map((l) => l.currentCents ?? 0),
      )
      return {
        lines,
        amount: lines.every((l) => l.currentCents !== null)
          ? payrollSum(lines.map((l) => l.currentCents!)) *
            (h.statement.deductionSign === 'negative' ? -1 : 1)
          : null,
        base: (h.statement.grossCents ?? 0) - excluded,
        excluded,
      }
    })
    if (
      observations.some((o) => !o.lines.length || o.amount === null || o.amount < 0 || o.base <= 0)
    )
      continue
    const first = observations[0],
      fixed = observations.every((o) => o.amount === first.amount)
    const rate = payrollRound(BigInt(first.amount!) * 10000n, BigInt(first.base))
    const varied =
      Math.max(...observations.map((o) => o.base)) >=
      Math.min(...observations.map((o) => o.base)) * 1.2
    if (
      !fixed &&
      (!varied ||
        !observations.every(
          (o) => Math.abs(payrollRound(BigInt(o.base) * BigInt(rate), 10000n) - o.amount!) <= 2,
        ))
    )
      continue
    deductions.push({
      code,
      label: first.lines
        .map((l) => l.label)
        .join(' + ')
        .slice(0, 160),
      applicable: true,
      mode: fixed ? 'fixed' : 'rate',
      fixedCents: fixed ? first.amount : null,
      rateBps: fixed ? null : rate,
      basis:
        fixed || observations.every((o) => o.excluded === 0) ? 'gross' : 'gross_less_recurring',
      annualWageCapCents: null,
      priorTaxableWagesCents: null,
    })
  }
  return { recurring, deductions, sampleCount: samples.length }
}
export function historicalPayrollDeduction(
  history: PayrollObservation[],
  code: string,
  gross: number,
) {
  const points = history.flatMap((h) => {
    const lines = h.statement.lines.filter((l) => l.side === 'deduction' && l.code === code)
    return h.statement.grossCents && lines.length && lines.every((l) => l.currentCents !== null)
      ? [
          {
            gross: h.statement.grossCents,
            value:
              payrollSum(lines.map((l) => l.currentCents!)) *
              (h.statement.deductionSign === 'negative' ? -1 : 1),
          },
        ]
      : []
  })
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const ratios = points.map((p) => p.value / p.gross),
    mid = median(ratios),
    mad = median(ratios.map((r) => Math.abs(r - mid)))
  const clean = points.filter(
    (p) => points.length < 5 || Math.abs(p.value / p.gross - mid) <= Math.max(0.1, 6 * mad),
  )
  const exact = code === 'federal' ? clean.filter((p) => p.gross === gross) : []
  const nearest = (exact.length ? exact : clean)
    .sort((a, b) => Math.abs(a.gross - gross) - Math.abs(b.gross - gross))
    .slice(0, 5)
  const low = nearest.filter((p) => p.gross <= gross).sort((a, b) => b.gross - a.gross)[0],
    high = nearest.filter((p) => p.gross >= gross).sort((a, b) => a.gross - b.gross)[0]
  if (code === 'federal' && low && high && high.gross > low.gross && high.value >= low.value)
    return {
      amountCents:
        low.value +
        payrollRound(
          BigInt(gross - low.gross) * BigInt(high.value - low.value),
          BigInt(high.gross - low.gross),
        ),
      method:
        'Historical interpolation between comparable ordinary-pay gross amounts; W-4 elections and exact withholding are unknown',
      sampleCount: 2,
      outliers: points.length - clean.length,
    }
  return {
    amountCents: nearest.length
      ? payrollRound(
          nearest.reduce((n, p) => n + BigInt(p.value), 0n),
          BigInt(nearest.length),
        )
      : null,
    method: 'Historical average of up to five nearest-gross comparable paychecks',
    sampleCount: nearest.length,
    outliers: points.length - clean.length,
  }
}
