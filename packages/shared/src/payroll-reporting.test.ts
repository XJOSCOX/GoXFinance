import { expect, it } from 'vitest'
import { payrollTaxReport } from './payroll-reporting'
import { hours } from './payroll.fixture'
import type { PayrollWeek } from './payroll'
const week = (date: string, ytd: number | null, code = 'federal'): PayrollWeek => ({
  ...hours,
  id: date,
  householdId: hours.sourceId,
  stage: 'paystub_reviewed',
  revision: 1,
  incomeTransactionId: null,
  statementReceivedAt: date + 'T00:00:00Z',
  reviewedAt: date + 'T01:00:00Z',
  createdAt: date + 'T00:00:00Z',
  updatedAt: date + 'T01:00:00Z',
  canManage: true,
  forecasts: [],
  statement: {
    employer: 'Fictional',
    assignment: null,
    periodStart: hours.workweekStart,
    periodEnd: hours.workweekEnd,
    payDate: date,
    grossCents: 100000,
    deductionsCents: 20000,
    netCents: 80000,
    acknowledgement: null,
    lines: [
      {
        label: 'Federal',
        side: 'deduction',
        code: code as 'federal',
        treatment: 'posttax',
        currentCents: 20000,
        ytdCents: ytd,
        hoursHundredths: null,
        rateCents: null,
        worked: null,
        confidence: 'manual',
      },
    ],
  },
})
it('uses latest YTD per year rather than adding cumulative statements, while keeping current-period totals', () => {
  const r = payrollTaxReport([
    week('2026-10-01', 10000),
    week('2026-10-08', 20000),
    week('2027-01-08', 5000),
  ])
  expect(r.latestYtd.map((v) => v.amountCents)).toEqual([20000, 5000])
  expect(r.grossCents).toBe(300000)
  expect(r.documentedNetCents).toBe(240000)
  expect(r.warnings).toHaveLength(0)
  expect(r.periods[0].netToGrossBps).toBe(8000)
})
it('warns about unknown and decreasing YTD observations without inventing a replacement', () => {
  const r = payrollTaxReport([
    week('2026-10-01', 20000),
    week('2026-10-08', 10000),
    week('2026-10-15', null),
  ])
  expect(r.warnings).toHaveLength(2)
  expect(r.latestYtd[0].amountCents).toBeNull()
})
