import type { PayrollProfileInput, PayrollWeek } from './payroll'
import { payrollImportedHours } from './payroll-upload'
import { payrollForecast } from './payroll-forecast'
import { payrollForecastContext } from './payroll-forecast-context'
import { hasPayrollBonus } from './payroll-learning'
import { payrollReconciliation, payrollRound } from './payroll-arithmetic'
export function payrollBacktest(weeks: PayrollWeek[], profile: PayrollProfileInput) {
  const rows = weeks
    .filter((w) => w.sourceId === profile.sourceId && w.reviewedAt && w.statement?.payDate)
    .map((w) => ({ ...w, reviewedAt: w.statement!.payDate! + 'T00:00:00Z' }))
    .sort((a, b) => a.statement!.payDate!.localeCompare(b.statement!.payDate!))
  const results = rows.map((w) => {
    const s = w.statement!,
      cutoff = s.payDate! + 'T00:00:00Z',
      imported = payrollImportedHours(
        s,
        profile.sourceId,
        s.payDate,
        w.payFrequency ?? profile.payFrequency ?? 'weekly',
      ),
      h = { ...imported, estimateDeductionsFromHistory: true },
      prior = rows.filter(
        (p) => p.id !== w.id && p.statement!.payDate! < s.payDate! && p.reviewedAt! < cutoff,
      ),
      ctx = payrollForecastContext(prior, h, cutoff, w.id)
    for (const [kind, code] of [
      ['overtime', 'overtime'],
      ['pto', 'pto'],
      ['holiday', 'holiday'],
      ['otherPaid', 'other_earning'],
    ] as const) {
      if (!s.lines.some((l) => l.side === 'earnings' && l.code === code)) h[`${kind}Hundredths`] = 0
    }
    if (h.overtimeHundredths === 0) h.overtimeRateCents = 0
    if (
      payrollReconciliation(s).length > 0 ||
      s.lines.some((l) => l.side === 'earnings' && l.currentCents === null) ||
      h.regularHundredths === null ||
      h.regularRateCents === null ||
      h.overtimeHundredths === null ||
      h.overtimeRateCents === null ||
      h.ptoHundredths === null ||
      h.holidayHundredths === null ||
      h.otherPaidHundredths === null
    )
      return {
        weekId: w.id,
        payDate: s.payDate!,
        bonus: hasPayrollBonus(s),
        sampleCount: ctx.samples.length,
        forecast: null,
        errors: [],
        skipped: 'Reported hours or rates are incomplete; no invented inputs.',
      }
    // Backtesting cannot reuse settings approved after the observation. Configuration assumptions are not inferred from future statements.
    const historicalProfile = { ...profile, rules: [], recurringEarnings: [] }
    const forecast = payrollForecast(historicalProfile, h, ctx.samples, [], cutoff)
    const comparison = (name: string, predicted: number | null, actual: number | null) => ({
      name,
      predictedCents: predicted,
      actualCents: actual,
      absoluteErrorCents:
        predicted === null || actual === null ? null : Math.abs(predicted - actual),
      percentageError:
        predicted === null || actual === null || actual === 0
          ? null
          : (Math.abs(predicted - actual) / Math.abs(actual)) * 100,
    })
    const errors = [
      comparison('gross', forecast.grossCents, s.grossCents),
      comparison('net', forecast.netCents, s.netCents),
      ...[
        ...new Set([
          ...forecast.deductions.map((d) => d.code),
          ...s.lines.filter((l) => l.side === 'deduction').map((l) => l.code),
        ]),
      ].map((code) => {
        const d = forecast.deductions.find((d) => d.code === code) ?? { code, amountCents: null }
        const ls = s.lines.filter(
          (l) => l.side === 'deduction' && (d.code === 'historical_total' || l.code === d.code),
        )
        const actual =
          d.code === 'historical_total'
            ? s.deductionsCents
            : ls.length && ls.every((l) => l.currentCents !== null)
              ? ls.reduce((n, l) => n + l.currentCents!, 0) *
                (s.deductionSign === 'negative' ? -1 : 1)
              : null
        return comparison(d.code, d.amountCents, actual)
      }),
    ]
    return {
      weekId: w.id,
      payDate: s.payDate!,
      bonus: hasPayrollBonus(s),
      sampleCount: forecast.explanation?.sampleCount ?? ctx.samples.length,
      forecast,
      errors,
      skipped: null,
    }
  })
  const summarize = (items: typeof results) => {
    const values = items
      .flatMap((r) =>
        r.errors
          .filter((e) => e.name === 'net' && e.absoluteErrorCents !== null)
          .map((e) => e.absoluteErrorCents!),
      )
      .sort((a, b) => a - b)
    return {
      evaluated: values.length,
      maeCents: values.length
        ? payrollRound(
            values.reduce((n, v) => n + BigInt(v), 0n),
            BigInt(values.length),
          )
        : null,
      medianAbsoluteErrorCents: values.length
        ? values.length % 2
          ? values[Math.floor(values.length / 2)]
          : payrollRound(
              BigInt(values[values.length / 2 - 1]) + BigInt(values[values.length / 2]),
              2n,
            )
        : null,
    }
  }
  return {
    label:
      'Historical backtest with actual reported hours, assuming prior paystubs were available on their printed paydays. Not saved-before-paystub accuracy. Uses no later-approved configuration.',
    results,
    summary: summarize(results),
    ordinary: summarize(results.filter((r) => !r.bonus)),
    bonus: summarize(results.filter((r) => r.bonus)),
    bySampleCount: [...new Set(results.map((r) => r.sampleCount))].map((sampleCount) => ({
      sampleCount,
      ...summarize(results.filter((r) => r.sampleCount === sampleCount)),
    })),
  }
}
