// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
    accounts: [1, 2, 3].map((id) => ({
      id: String(id),
      nickname: `Account ${id}`,
      stage: id === 3 ? 'xfa' : 'combine',
    })),
    results: [1, 2, 3].map((id) => ({
      id: String(id),
      accountId: String(id),
      sessionDate: '2026-10-19',
      profitCents: 35000,
      lossCents: 10000,
      feesCents: 250,
      grossCents: 25000,
      netCents: 24750,
    })),
    payouts: [{ status: 'paid', receivedCents: 999999 }],
  } as TradingData)
  expect(screen.getByText('Profit, loss & account details').closest('details')!.open).toBe(false)
  fireEvent.click(screen.getByText('Profit, loss & account details'))
  const region = within(screen.getByRole('region', { name: 'Trading performance' }))
  const combine = within(region.getByRole('region', { name: 'Combine P&L' }))
  const funded = within(region.getByRole('region', { name: 'Funded account P&L' }))
  for (const amount of ['$700.00', '$200.00', '$5.00', '$495.00'])
    expect(combine.getByText(amount)).toBeTruthy()
  for (const amount of ['$350.00', '$100.00', '$2.50'])
    expect(funded.getByText(amount)).toBeTruthy()
  expect(funded.getAllByText('$247.50')).toHaveLength(2)
  expect(region.queryByText('$742.50')).toBeNull()
  expect(region.queryByText('$9,999.99')).toBeNull()
  expect(region.getByText(/3 accounts/)).toBeTruthy()
  expect(region.getByText(/Not payout income or available cash/)).toBeTruthy()
})
it('reports an empty month without inventing transactions', () => {
  show({ accounts: [], results: [], payouts: [] } as unknown as TradingData)
  expect(screen.getByText('No results recorded for this month.')).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Combine summary' }).textContent).toContain('$0.00')
  expect(screen.getByRole('region', { name: 'Funded summary' }).textContent).toContain('$0.00')
})
it('shows loading and errors without misleading zero totals', () => {
  show(null, 'Request failed')
  expect(screen.getByRole('alert').textContent).toContain('Request failed')
  expect(screen.queryByText('$0.00')).toBeNull()
})
