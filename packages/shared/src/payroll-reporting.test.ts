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
it('recognizes equivalent federal tax labels within one employer without combining different employers', () => {
  const old = week('2026-09-01', 10000),
    recent = week('2026-10-01', 20000),
    other = week('2026-10-02', 30000)
  old.statement!.lines[0].label = 'FED INC TAX'
  recent.statement!.lines[0].label = 'Federal income tax'
  other.sourceId = 'different-employer'
  const report = payrollTaxReport([old, recent, other])
  expect(report.latestYtd).toHaveLength(2)
  expect(report.latestYtd.map((r) => r.amountCents)).toEqual([20000, 30000])
  expect(report.latestYtd.every((r) => r.label === 'Federal income tax')).toBe(true)
})
it('uses military YTD-only tax details without double-counting combined FICA or current payments', () => {
  const w = week('2026-10-01', 10000),
    base = w.statement!.lines[0]
  w.statement!.lines.push(
    { ...base, label: 'FICA TAX', code: 'other_deduction', currentCents: 8000, ytdCents: 65000 },
    {
      ...base,
      label: 'Social security tax YTD',
      code: 'social_security',
      side: 'informational',
      currentCents: null,
      ytdCents: 50000,
    },
    {
      ...base,
      label: 'Medicare tax YTD',
      code: 'medicare',
      side: 'informational',
      currentCents: null,
      ytdCents: 15000,
    },
    {
      ...base,
      label: 'TSP deferred YTD',
      code: 'traditional',
      side: 'informational',
      currentCents: null,
      ytdCents: 30000,
    },
    {
      ...base,
      label: 'Total deductions YTD',
      code: 'other_deduction',
      side: 'informational',
      currentCents: null,
      ytdCents: 105000,
    },
  )
  const before = JSON.stringify(w),
    r = payrollTaxReport([w])
  expect(r.latestYtd.map((l) => l.code)).toEqual([
    'federal',
    'social_security',
    'medicare',
    'traditional',
  ])
  expect(r.latestYtd.find((l) => l.code === 'medicare')?.amountCents).toBe(15000)
  expect(r.periods[0].employeeWithholding.map((l) => l.currentCents)).toEqual([20000, 8000])
  expect(r.documentedNetCents).toBe(80000)
  expect(JSON.stringify(w)).toBe(before)
})
it('preserves differently named retirement plans and state taxes for one employer', () => {
  const w = week('2026-10-01', 10000),
    base = w.statement!.lines[0]
  w.statement!.lines = [
    { ...base, label: 'State A tax', code: 'state' },
    { ...base, label: 'State B tax', code: 'state' },
    { ...base, label: 'Roth 401(k)', code: 'roth' },
    { ...base, label: 'Roth TSP', code: 'roth' },
  ]
  expect(payrollTaxReport([w]).latestYtd).toHaveLength(4)
})
it('removes a superseded combined FICA observation once newer separate YTD taxes are available', () => {
  const older = week('2026-09-01', 60000),
    newer = week('2026-10-01', 10000),
    base = newer.statement!.lines[0]
  older.statement!.lines[0] = {
    ...base,
    code: 'other_deduction',
    label: 'FICA TAX',
    ytdCents: 60000,
  }
  newer.statement!.lines = [
    {
      ...base,
      code: 'social_security',
      side: 'informational',
      label: 'Social security tax YTD',
      currentCents: null,
      ytdCents: 55000,
    },
    {
      ...base,
      code: 'medicare',
      side: 'informational',
      label: 'Medicare tax YTD',
      currentCents: null,
      ytdCents: 13000,
    },
  ]
  expect(payrollTaxReport([older, newer]).latestYtd.map((l) => l.code)).toEqual([
    'social_security',
    'medicare',
  ])
})
