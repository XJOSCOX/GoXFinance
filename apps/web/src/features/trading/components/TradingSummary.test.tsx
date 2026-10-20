// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { TradingData } from '@goxfinance/shared'
import { TradingSummary } from './TradingSummary'
afterEach(cleanup)
it('shows per-account stage totals and only confirmed funded deposits as cash', () => {
  const paid = {
    id: 'p',
    accountId: 'funded',
    status: 'paid',
    receiptConfirmed: true,
    incomeTransactionId: 'income',
    receivedCents: 9000,
  }
  render(
    <TradingSummary
      data={
        {
          accounts: [
            { id: 'combine', nickname: 'Evaluation', stage: 'combine' },
            { id: 'funded', nickname: 'Funded', stage: 'xfa' },
          ],
          results: [
            { id: 'r1', accountId: 'combine', netCents: 10000, feesCents: 0 },
            { id: 'r2', accountId: 'funded', netCents: -2000, feesCents: 0 },
          ],
          payouts: [
            paid,
            paid,
            { ...paid, id: 'pending', status: 'requested', requestedCents: 100000 },
            {
              ...paid,
              id: 'approved',
              status: 'approved',
              requestedCents: 20000,
              approvedCents: 15000,
            },
            { ...paid, id: 'invalid', accountId: 'combine', receivedCents: 999999 },
            { ...paid, id: 'unconfirmed', receiptConfirmed: false, receivedCents: 999999 },
          ],
        } as unknown as TradingData
      }
    />,
  )
  expect(
    within(screen.getByRole('region', { name: 'Combine P&L' })).getAllByText('$100.00'),
  ).toHaveLength(2)
  expect(
    within(screen.getByRole('region', { name: 'Funded account P&L' })).getAllByText('-$20.00'),
  ).toHaveLength(2)
  expect(screen.getByText('$90.00')).toBeTruthy()
  expect(screen.getByText('$1,150.00')).toBeTruthy()
  expect(screen.queryByText('$9,999.99')).toBeNull()
  expect(screen.queryByText('$80.00')).toBeNull()
})
