// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TradingData } from '@goxfinance/shared'
import { TradingSummary } from './TradingSummary'
afterEach(cleanup)
it('shows a compact ordered summary and only confirmed funded deposits as cash', () => {
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
  expect(screen.getByText('$100.00 each')).toBeTruthy()
  expect(screen.getByText('-$20.00')).toBeTruthy()
  expect(screen.getByText('$90.00')).toBeTruthy()
  expect(screen.getByText(/\$1,150.00 requested \/ approved/)).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Combine P&L' })).toBeNull()
  expect(screen.queryByText('Evaluation')).toBeNull()
  expect(screen.queryByText('$9,999.99')).toBeNull()
  expect(screen.queryByText('$80.00')).toBeNull()
})

it('shows each and total only for matching account results, and uses a combined total when they differ', () => {
  const data = {
    accounts: [
      { id: 'a', stage: 'combine' },
      { id: 'b', stage: 'combine' },
      { id: 'c', stage: 'combine' },
    ],
    results: ['a', 'b', 'c'].map((accountId) => ({
      id: accountId,
      accountId,
      netCents: 15000,
      feesCents: 0,
    })),
    payouts: [],
  } as unknown as TradingData
  const view = render(<TradingSummary data={data} />)
  expect(screen.getByText('$150.00 each')).toBeTruthy()
  expect(screen.getByText('$450.00 all 3 accounts · not cash')).toBeTruthy()
  view.rerender(
    <TradingSummary
      data={{
        ...data,
        results: data.results.map((r) => ({ ...r, netCents: r.accountId === 'a' ? -5000 : 15000 })),
      }}
    />,
  )
  expect(screen.queryByText(/each/)).toBeNull()
  expect(screen.getByText('$250.00')).toBeTruthy()
  expect(screen.getByText('3 accounts · results differ · not cash')).toBeTruthy()
})
