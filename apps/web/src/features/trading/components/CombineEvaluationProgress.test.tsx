// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TradingAccount } from '@goxfinance/shared'
import { AccountPayoutProgress } from './AccountPayoutProgress'
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
it('shows Combine evaluation settings without funded winning-day or payout labels', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-20T18:00:00Z'))
  const today = new Date().toISOString().slice(0, 10)
  const account = {
    id: 'combine',
    nickname: 'Example Combine',
    stage: 'combine',
    timezone: 'America/Chicago',
    sessionStart: '17:00',
    activationDate: null,
    ruleSnapshots: [
      {
        id: 'rule',
        label: 'Example',
        effectiveDate: today,
        profitTargetCents: 300000,
        combineConsistencyBps: 5500,
        maximumMiniContracts: 5,
        maximumMicroContracts: 50,
        profitShareBps: 9000,
        minimumDays: 5,
        minimumWinningDayCents: 15000,
        maximumPayoutCents: 400000,
      },
    ],
  } as TradingAccount
  render(<AccountPayoutProgress account={account} results={[]} payouts={[]} />)
  expect(screen.getByRole('region', { name: 'Combine evaluation' })).toBeTruthy()
  expect(screen.getByText('$3,000.00')).toBeTruthy()
  expect(screen.getByText('55%')).toBeTruthy()
  expect(screen.getByText('No results entered')).toBeTruthy()
  expect(screen.queryByText('Estimated payout after split')).toBeNull()
  expect(screen.queryByText('Winning-day progress')).toBeNull()
})
