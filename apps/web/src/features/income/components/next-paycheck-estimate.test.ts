import { expect, it } from 'vitest'
import type { IncomeSource, IncomeTransaction, PayrollWeek } from '@goxfinance/shared'
import {
  estimatedWorkedTime,
  latestPaycheckForecast,
  nextPaycheckEstimate,
} from './next-paycheck-estimate'
const source = { id: 'employer', status: 'active', isArchived: false } as IncomeSource
const forecast = {
  id: 'forecast',
  createdAt: '2026-10-20T12:00:00Z',
  modelVersion: 2,
  result: { grossCents: 96417, netCents: 80721, workedHundredths: 3857 },
}
const week = {
  id: 'next',
  sourceId: source.id,
  stage: 'hours_draft',
  statement: null,
  statementReceivedAt: null,
  incomeTransactionId: null,
  workweekStart: '2026-11-18',
  workweekEnd: '2026-11-22',
  expectedPayDate: '2026-11-27',
  regularMinutes: 2314,
  regularHundredths: 3857,
  overtimeHundredths: 0,
  forecasts: [forecast],
} as unknown as PayrollWeek
it('selects the earliest upcoming undocumentated forecast and excludes received, cancelled, past or hidden sources', () => {
  const later = { ...week, id: 'later', expectedPayDate: '2026-12-04' },
    past = { ...week, id: 'past', expectedPayDate: '2026-10-19' },
    confirmed = {
      ...week,
      id: 'confirmed',
      stage: 'deposit_confirmed' as const,
      expectedPayDate: '2026-10-21',
    },
    documented = {
      ...week,
      id: 'documented',
      statementReceivedAt: '2026-10-20',
      expectedPayDate: '2026-10-21',
    },
    cancelled = {
      ...week,
      id: 'cancelled',
      incomeTransactionId: 'cancelled',
      expectedPayDate: '2026-10-21',
    }
  expect(
    nextPaycheckEstimate(
      [later, past, confirmed, documented, cancelled, week],
      [source],
      [{ id: 'cancelled', status: 'cancelled' } as IncomeTransaction],
      '2026-10-20',
    )?.id,
  ).toBe('next')
  expect(nextPaycheckEstimate([week], [], [], '2026-10-20')).toBeUndefined()
  expect(
    nextPaycheckEstimate([week], [{ ...source, isArchived: true }], [], '2026-10-20'),
  ).toBeUndefined()
})
it('includes payday today, uses the newest model and preserves exact hours and minutes', () => {
  expect(
    nextPaycheckEstimate([{ ...week, expectedPayDate: '2026-10-20' }], [source], [], '2026-10-20'),
  ).toBeTruthy()
  expect(estimatedWorkedTime(week)).toBe('38h 34min')
  expect(
    latestPaycheckForecast({
      ...week,
      forecasts: [
        ...week.forecasts,
        {
          ...week.forecasts[0],
          modelVersion: 1,
          result: { ...week.forecasts[0].result, netCents: 1 },
        },
      ],
    })?.netCents,
  ).toBe(80721)
})
