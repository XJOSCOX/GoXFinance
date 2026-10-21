import { expect, it } from 'vitest'
import { payrollForecast, payrollReconciliation } from './payroll-calculations'
import { payrollForecastContext } from './payroll-forecast-context'
import { profile, hours } from './payroll.fixture'
import type { PayrollStatement, PayrollWeek } from './payroll'
const statement = {
  grossCents: 100000,
  deductionsCents: 20000,
  netCents: 80000,
  lines: [
    {
      side: 'earnings',
      code: 'regular',
      treatment: 'not_applicable',
      currentCents: 100000,
      hoursHundredths: null,
    },
    {
      side: 'deduction',
      code: 'federal',
      treatment: 'posttax',
      currentCents: 20000,
      hoursHundredths: null,
    },
  ],
} as unknown as PayrollStatement
it('keeps take-home unknown without usable prior history and requires an explicit historical-estimate choice', () => {
  expect(
    payrollForecast(profile, { ...hours, estimateDeductionsFromHistory: true }, []).netCents,
  ).toBeNull()
  expect(
    payrollForecast(profile, hours, [{ statement, reviewedAt: '2026-10-01' }]).netCents,
  ).toBeNull()
  const inconsistent = { ...statement, netCents: 90000 }
  expect(payrollReconciliation(inconsistent).length).toBeGreaterThan(0)
  expect(
    payrollForecast(profile, { ...hours, estimateDeductionsFromHistory: true }, [
      { statement: inconsistent, reviewedAt: '2026-10-01' },
    ]).netCents,
  ).toBeNull()
})
it('does not train a forecast on another employer, a later work period or unreviewed statements', () => {
  const base = {
    ...hours,
    id: 'prior',
    workweekStart: '2026-09-21',
    workweekEnd: '2026-09-27',
    reviewedAt: '2026-09-30',
    statement,
    forecasts: [],
  } as unknown as PayrollWeek
  const context = payrollForecastContext(
    [
      base,
      { ...base, id: 'another', sourceId: 'another' },
      { ...base, id: 'later', workweekEnd: '2026-10-10' },
      { ...base, id: 'unreviewed', reviewedAt: null },
    ],
    hours,
    '2026-10-05T00:00:00Z',
  )
  expect(context.prior.map((p) => p.id)).toEqual(['prior'])
})
