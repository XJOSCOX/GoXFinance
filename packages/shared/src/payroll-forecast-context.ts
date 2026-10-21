import { payrollComparison, payrollReconciliation } from './payroll-calculations'
import type { PayrollWeek, WeeklyHoursInput } from './payroll'
export function payrollForecastContext(
  weeks: PayrollWeek[],
  hours: WeeklyHoursInput,
  now: string,
  id?: string,
) {
  const prior = weeks.filter(
    (v) =>
      v.sourceId === hours.sourceId &&
      (v.payFrequency ?? 'weekly') === (hours.payFrequency ?? 'weekly') &&
      v.id !== id &&
      v.reviewedAt &&
      v.reviewedAt < now &&
      v.workweekEnd < hours.workweekStart &&
      v.statement &&
      payrollReconciliation(v.statement).length === 0,
  )
  return {
    prior,
    samples: prior.map((v) => ({
      statement: v.statement!,
      reviewedAt: v.reviewedAt!,
      sourceId: v.sourceId,
    })),
    errors: prior
      .map((v) => payrollComparison(v)?.errorCents)
      .filter((v): v is number => v !== undefined && v !== null),
  }
}
