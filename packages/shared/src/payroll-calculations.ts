import { payrollSum } from './payroll-arithmetic'
import type { PayrollWeek } from './payroll'
export * from './payroll-arithmetic'
export { payrollForecast } from './payroll-forecast'
export function payrollComparison(
  week: Pick<
    PayrollWeek,
    'statement' | 'statementReceivedAt' | 'forecasts' | 'forecastPeriodReconciled'
  >,
) {
  if (week.forecastPeriodReconciled) return null
  const actual = week.statement,
    forecast = [...week.forecasts]
      .filter(
        (f) =>
          f.eligibleForAccuracy &&
          week.statementReceivedAt &&
          f.createdAt < week.statementReceivedAt,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!actual || !forecast) return null
  const predicted = forecast.result,
    actualDed = (codes: string[]) => {
      const lines = actual.lines.filter((l) => l.side === 'deduction' && codes.includes(l.code))
      return lines.length && lines.every((l) => l.currentCents !== null)
        ? payrollSum(lines.map((l) => l.currentCents!)) *
            (actual.deductionSign === 'negative' ? -1 : 1)
        : null
    },
    predDed = (codes: string[]) => {
      const lines = predicted.deductions.filter((l) => codes.includes(l.code))
      return lines.length && lines.every((l) => l.amountCents !== null)
        ? payrollSum(lines.map((l) => l.amountCents!))
        : null
    },
    errorCents =
      actual.netCents !== null && predicted.netCents !== null
        ? payrollSum([actual.netCents, -predicted.netCents])
        : null
  return {
    forecastId: forecast.id,
    gross: { predicted: predicted.grossCents, actual: actual.grossCents },
    federal: { predicted: predDed(['federal']), actual: actualDed(['federal']) },
    fica: {
      predicted: predDed(['social_security', 'medicare']),
      actual: actualDed(['social_security', 'medicare']),
    },
    deductions: {
      predicted: predicted.netCents === null ? null : predicted.grossCents - predicted.netCents,
      actual: actual.deductionsCents,
    },
    otherDeductions: {
      predicted: predDed([
        'roth',
        'traditional',
        'insurance',
        'disability',
        'pretax_benefit',
        'other_deduction',
      ]),
      actual: actualDed([
        'roth',
        'traditional',
        'insurance',
        'disability',
        'pretax_benefit',
        'other_deduction',
      ]),
    },
    net: { predicted: predicted.netCents, actual: actual.netCents },
    errorCents,
    errorPercent:
      errorCents !== null && actual.netCents
        ? Number(((errorCents / actual.netCents) * 100).toFixed(2))
        : null,
  }
}
