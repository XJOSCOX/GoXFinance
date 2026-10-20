// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { TradingData } from '@goxfinance/shared'
import { useOverviewTrading } from '../hooks/useOverviewTrading'
import { OverviewTrading } from './OverviewTrading'
vi.mock('../hooks/useOverviewTrading', () => ({ useOverviewTrading: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
function show(data: TradingData | null, error = '') {
  vi.mocked(useOverviewTrading).mockReturnValue({ data, error, retry: vi.fn() })
  render(<OverviewTrading home="household" month="2026-10" />)
}
it('shows combined performance separately from payout deposits', () => {
  show({
    accounts: [{}, {}, {}],
    results: [1, 2, 3].map((id) => ({
      id: String(id),
      sessionDate: '2026-10-19',
      profitCents: 35000,
      lossCents: 10000,
      feesCents: 250,
      grossCents: 25000,
      netCents: 24750,
    })),
    payouts: [{ status: 'paid', receivedCents: 999999 }],
  } as TradingData)
  const region = within(screen.getByRole('region', { name: 'Trading performance' }))
  for (const amount of ['$1,050.00', '$300.00', '$7.50', '$742.50'])
    expect(region.getByText(amount)).toBeTruthy()
  expect(region.queryByText('$9,999.99')).toBeNull()
  expect(region.getByText(/3 accounts/)).toBeTruthy()
  expect(region.getByText(/Not payout income or available cash/)).toBeTruthy()
})
it('reports an empty month without inventing transactions', () => {
  show({ accounts: [], results: [], payouts: [] } as unknown as TradingData)
  expect(screen.getByText('No results recorded for this month.')).toBeTruthy()
  expect(screen.getAllByText('$0.00')).toHaveLength(4)
})
it('shows loading and errors without misleading zero totals', () => {
  show(null, 'Request failed')
  expect(screen.getByRole('alert').textContent).toContain('Request failed')
  expect(screen.queryByText('$0.00')).toBeNull()
})
