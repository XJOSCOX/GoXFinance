import { expect, it } from 'vitest'
import { combinedPayrollYtd } from './payroll-ytd-totals'
import { payrollTaxReport } from './payroll-reporting'
import type { PayrollWeek } from './payroll'
function week(sourceId: string, day: string, amount: number | null, negative = false): PayrollWeek {
  return {
    sourceId,
    reviewedAt: day,
    statement: {
      payDate: day,
      grossCents: 100000,
      netCents: 80000,
      deductionSign: negative ? 'negative' : 'positive',
      lines: [
        {
          label: 'Federal income tax',
          code: 'federal',
          side: 'deduction',
          ytdCents: amount,
          currentCents: 10000,
        },
      ],
    },
  } as PayrollWeek
}
it('combines latest employer YTD with opposite printed signs without summing previous paychecks', () => {
  const report = payrollTaxReport([
    week('job', '2026-09-01', -8000, true),
    week('job', '2026-10-01', -10000, true),
    week('military', '2026-09-25', 3000),
  ])
  const before = JSON.stringify(report)
  expect(combinedPayrollYtd(report.latestYtd)).toMatchObject([
    { amountCents: 13000, employerCount: 2, missingCount: 0 },
  ])
  expect(JSON.stringify(report)).toBe(before)
})
it('labels incomplete subtotals and leaves wholly unreported categories unknown', () => {
  const report = payrollTaxReport([week('a', '2026-10-01', 10000), week('b', '2026-10-01', null)])
  expect(combinedPayrollYtd(report.latestYtd)[0]).toMatchObject({
    amountCents: 10000,
    employerCount: 2,
    missingCount: 1,
  })
  expect(
    combinedPayrollYtd(payrollTaxReport([week('a', '2026-10-01', null)]).latestYtd)[0],
  ).toMatchObject({ amountCents: null, missingCount: 1 })
})
it('preserves documented credits instead of applying absolute values to all deductions', () => {
  expect(
    combinedPayrollYtd(
      payrollTaxReport([week('a', '2026-10-01', 10000), week('b', '2026-10-01', -2000)]).latestYtd,
    )[0].amountCents,
  ).toBe(8000)
})
