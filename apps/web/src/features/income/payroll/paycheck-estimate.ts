import {
  bankDecimalCents,
  weeklyHoursSchema,
  payrollPeriodEnd,
  parsePayrollHours,
  type PayrollProfile,
} from '@goxfinance/shared'
export function paycheckEstimateHours(f: FormData, profile: PayrollProfile) {
  const frequency = profile.payFrequency ?? 'weekly',
    start = String(f.get('start') ?? ''),
    end = String(f.get('end') ?? ''),
    regular = parsePayrollHours(String(f.get('regular') ?? '')),
    overtime = parsePayrollHours(String(f.get('overtime') || '0')),
    pto = parsePayrollHours(String(f.get('pto') || '0'))
  if (overtime.hundredths > 0 && !f.get('overtimeRate'))
    throw new Error('Enter the overtime rate for these overtime hours.')
  return weeklyHoursSchema.parse({
    sourceId: profile.sourceId,
    payFrequency: frequency,
    periodAnchor: profile.periodAnchor ?? null,
    semiMonthlySplitDay: profile.semiMonthlySplitDay ?? 15,
    workweekStart: start,
    workweekEnd: end,
    expectedPayDate: f.get('payDate'),
    customWorkPeriod:
      payrollPeriodEnd(start, frequency, profile.semiMonthlySplitDay, profile.periodAnchor) !== end,
    estimateDeductionsFromHistory: f.get('useHistory') === 'on',
    regularHundredths: regular.hundredths,
    regularMinutes: regular.minutes,
    overtimeHundredths: overtime.hundredths,
    overtimeMinutes: overtime.minutes,
    regularRateCents: bankDecimalCents(String(f.get('regularRate') ?? '')),
    overtimeRateCents: bankDecimalCents(String(f.get('overtimeRate') || '0')),
    ptoHundredths: pto.hundredths,
    ptoMinutes: pto.minutes,
    holidayHundredths: 0,
    otherPaidHundredths: 0,
    unpaidHundredths: null,
    bonusCents: bankDecimalCents(String(f.get('bonus') || '0')),
    adjustmentCents: 0,
    otherEarningsCents: 0,
    notes: null,
  })
}
