// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PaycheckEstimateComparison } from './PaycheckEstimateComparison'
import { syntheticWeeks } from '../../../../../../packages/shared/src/payroll-v2.fixture'
import { profile, hours } from '../../../../../../packages/shared/src/payroll.fixture'
import { payrollForecast, payrollComparison, type PayrollWeek } from '@goxfinance/shared'
afterEach(cleanup)
function week(): PayrollWeek {
  const w = syntheticWeeks(1)[0]
  return {
    ...w,
    statementReceivedAt: '2026-01-17T00:00:00Z',
    forecasts: [
      {
        id: 'before',
        modelVersion: 1,
        createdAt: '2026-01-15T00:00:00Z',
        eligibleForAccuracy: true,
        result: {
          ...payrollForecast(profile, hours, []),
          grossCents: 80000,
          netCents: 65000,
          deductions: [
            {
              code: 'federal',
              label: 'Federal',
              amountCents: 15000,
              method: 'Synthetic',
              sampleCount: 1,
            },
          ],
        },
      },
    ],
  }
}
it('shows actual paystub net above the frozen estimate without asserting a received deposit', () => {
  render(<PaycheckEstimateComparison week={week()} />)
  expect(screen.getByText('$14.00 above estimate')).toBeTruthy()
  expect(screen.getByText('$650.00')).toBeTruthy()
  expect(screen.getByText('$664.00')).toBeTruthy()
  expect(screen.getByText(/separate from deposit confirmation/)).toBeTruthy()
})
it('shows below and equal results clearly', () => {
  const w = week()
  w.statement!.netCents = 64000
  const view = render(<PaycheckEstimateComparison week={w} />)
  expect(screen.getByText('$10.00 below estimate')).toBeTruthy()
  w.statement!.netCents = 65000
  view.rerender(<PaycheckEstimateComparison week={w} />)
  expect(screen.getByText('Matches estimate')).toBeTruthy()
})
it('never scores estimates made after receipt, unknown amounts or changed work periods', () => {
  const w = week()
  w.forecasts[0].createdAt = '2026-01-18T00:00:00Z'
  const view = render(<PaycheckEstimateComparison week={w} />)
  expect(screen.queryByRole('region')).toBeNull()
  w.forecasts[0].createdAt = '2026-01-15T00:00:00Z'
  w.forecasts[0].result.netCents = null
  view.rerender(<PaycheckEstimateComparison week={w} />)
  expect(screen.queryByRole('region')).toBeNull()
  w.forecasts[0].result.netCents = 65000
  view.rerender(<PaycheckEstimateComparison week={{ ...w, forecastPeriodReconciled: true }} />)
  expect(screen.queryByRole('region')).toBeNull()
})
it('uses the newest eligible model when timestamps tie and ignores later document-derived estimates', () => {
  const w = week()
  w.forecasts.push({
    ...w.forecasts[0],
    id: 'newest',
    modelVersion: 2,
    result: { ...w.forecasts[0].result, netCents: 66000 },
  })
  w.forecasts.push({
    ...w.forecasts[0],
    id: 'after',
    modelVersion: 3,
    createdAt: '2026-01-18T00:00:00Z',
    eligibleForAccuracy: false,
  })
  expect(payrollComparison(w)).toMatchObject({ forecastId: 'newest', errorCents: 400 })
})
