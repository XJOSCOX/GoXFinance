// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { TradingAccount } from '@goxfinance/shared'
import { PayoutForm } from './PayoutForm'
import { readTradingRule } from '../lib/rule-fields'

afterEach(cleanup)
it('shows an editable split estimate without filling or confirming an actual deposit', () => {
  const account = {
    id: '10000000-0000-4000-8000-000000000001',
    nickname: 'Example',
    stage: 'xfa',
    ruleSnapshots: [
      {
        id: 'rule',
        createdAt: '2026-01-01T00:00:00Z',
        label: 'Example rule',
        effectiveDate: '2026-01-01',
        profitShareBps: 9000,
        maximumPayoutCents: 400000,
      },
    ],
  } as TradingAccount
  render(<PayoutForm accounts={[account]} income={null} save={vi.fn()} close={() => {}} />)
  fireEvent.change(screen.getByLabelText('Requested amount ($)'), { target: { value: '1000' } })
  expect(screen.getByText('$900.00')).toBeTruthy()
  expect(screen.getByText(/Provider \(10%\)/).textContent).toContain('$100.00')
  fireEvent.change(screen.getByLabelText('Payout status'), { target: { value: 'paid' } })
  expect((screen.getByLabelText('Actual net amount received ($)') as HTMLInputElement).value).toBe(
    '',
  )
  expect(
    (screen.getByLabelText('I confirm these funds were actually received.') as HTMLInputElement)
      .checked,
  ).toBe(false)
})
it('parses percentage points into exact basis points and keeps unspecified rules unknown', () => {
  const data = new FormData()
  data.set('ruleLabel', 'Example')
  data.set('ruleDate', '2026-10-19')
  data.set('rule:profitShareBps', '90.01')
  data.set('rule:activationFeeCents', '0')
  expect(readTradingRule(data)).toMatchObject({
    profitShareBps: 9001,
    activationFeeCents: 0,
    minimumWinningDayCents: null,
    maintainBalanceBetweenPayouts: null,
  })
})
