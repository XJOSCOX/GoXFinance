// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TradingData } from '@goxfinance/shared'
import { TradingJournalCalendar } from './TradingJournalCalendar'
afterEach(cleanup)
it('switches all accounts and individual accounts, changes months, and labels simulated P&L as noncash', () => {
  const data = {
    accounts: [
      { id: 'a', nickname: 'Example Leader', stage: 'combine' },
      { id: 'b', nickname: 'Example Follower', stage: 'combine' },
    ],
    results: [
      { id: '1', accountId: 'a', sessionDate: '2026-10-09', netCents: 10000, tradeCount: 2 },
      { id: '2', accountId: 'b', sessionDate: '2026-10-09', netCents: 10000, tradeCount: 2 },
    ],
    events: [],
    groups: [],
    payouts: [],
    batches: [],
  } as unknown as TradingData
  render(<TradingJournalCalendar data={data} />)
  fireEvent.change(screen.getByLabelText('Journal month'), { target: { value: '2026-10' } })
  expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0)
  expect(screen.getByText(/not household cash or received income/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Journal account'), { target: { value: 'a' } })
  expect(screen.queryByText('$200.00')).toBeNull()
  expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Next journal month' }))
  expect((screen.getByLabelText('Journal month') as HTMLInputElement).value).toBe('2026-11')
  expect(screen.getByText(/0 recorded days/)).toBeTruthy()
})
