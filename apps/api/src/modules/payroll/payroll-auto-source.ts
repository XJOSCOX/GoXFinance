import {
  payrollProfileSchema,
  payrollStatementHours,
  type PayrollStatement,
  type PayrollFrequency,
} from '@goxfinance/shared'
export function automaticPayrollProfile(
  sourceId: string,
  s: PayrollStatement,
  frequency: PayrollFrequency,
  split = 15,
  fallbackEmployer?: string,
) {
  const h = payrollStatementHours(s),
    weekday = (day: string | null) => (day ? new Date(day + 'T12:00:00Z').getUTCDay() : 1),
    offset =
      s.payDate && s.periodEnd
        ? Math.round((Date.parse(s.payDate) - Date.parse(s.periodEnd)) / 86400000)
        : null
  return payrollProfileSchema.parse({
    sourceId,
    employer: s.employer ?? fallbackEmployer ?? s.assignment ?? 'Payroll issuer not yet identified',
    assignment: s.assignment,
    regularRateCents: h.regularRateCents,
    overtimeRateCents: h.overtimeRateCents,
    regularThresholdHundredths: null,
    payFrequency: frequency,
    periodAnchor: s.periodStart,
    semiMonthlySplitDay: split,
    depositOffsetDays: offset !== null && offset >= -31 && offset <= 60 ? offset : null,
    timezone: 'America/Chicago',
    workweekStartDay: weekday(s.periodStart),
    hoursDay: 0,
    processingDay: 1,
    statementDay: 3,
    depositDay: weekday(s.payDate),
    milestonesConfigured: false,
    rules: [],
  })
}
