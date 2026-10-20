// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { TradingAccount } from '@goxfinance/shared'
import { DailyResultsForm } from './DailyResultsForm'
afterEach(cleanup)
it('records a reported day and identical explicitly applied net values without inventing a breakdown or execution time', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  const accounts = [
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
  ].map((id, i) => ({
    id,
    nickname: `Account ${i + 1}`,
    timezone: 'America/Chicago',
    sessionStart: '17:00',
  })) as TradingAccount[]
  render(<DailyResultsForm accounts={accounts} save={save} close={() => {}} />)
  fireEvent.click(screen.getByLabelText('Use reported trading day (no execution time)'))
  fireEvent.change(screen.getByLabelText('Reported trading day'), {
    target: { value: '2026-10-09' },
  })
  fireEvent.click(screen.getByLabelText('Only fee-adjusted net result is known'))
  fireEvent.click(screen.getByRole('button', { name: 'Select all accounts' }))
  fireEvent.change(screen.getByLabelText('Shared net result ($, fees included)'), {
    target: { value: '-12.34' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Apply to selected accounts' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save 2 daily results' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  const rows = save.mock.calls[0][0].values
  expect(rows).toHaveLength(2)
  rows.forEach((r: object) =>
    expect(r).toMatchObject({
      reportedDate: '2026-10-09',
      grossCents: -1234,
      profitCents: null,
      lossCents: null,
      feesIncluded: true,
      feesCents: 0,
    }),
  )
  expect(rows[0].sessionAt.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10))
})
