// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { TradingAccount } from '@goxfinance/shared'
import { DailyResultsForm } from './DailyResultsForm'
import { BatchForm } from './BatchForm'

afterEach(cleanup)
const accounts = Array.from(
  { length: 4 },
  (_, i) =>
    ({
      id: `10000000-0000-4000-8000-00000000000${i}`,
      nickname: `Account ${i}`,
      timezone: 'America/Chicago',
      sessionStart: '18:00',
    }) as TradingAccount,
)
it('selects all daily results without assuming identical profits or fees', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(<DailyResultsForm accounts={accounts} save={save} close={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Select all accounts' }))
  fireEvent.change(screen.getByLabelText('Session timestamp (your device time)'), {
    target: { value: '2026-10-10T15:00' },
  })
  accounts.forEach((a, i) => {
    const profit = screen.getByLabelText(`${a.nickname} Profit ($)`) as HTMLInputElement
    expect(profit.value).toBe('')
    fireEvent.change(profit, { target: { value: ['100', '0', '0', '30'][i] } })
    fireEvent.change(screen.getByLabelText(`${a.nickname} Loss ($)`), {
      target: { value: i === 1 ? '50' : '0' },
    })
    fireEvent.change(screen.getByLabelText(`${a.nickname} Fees ($)`), { target: { value: '1' } })
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save 4 daily results' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0].values.map((v: { grossCents: number }) => v.grossCents)).toEqual([
    10000, -5000, 0, 3000,
  ])
})
it('selects all payouts, applies a requested amount explicitly and allows individual adjustments', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(<BatchForm accounts={accounts} save={save} close={() => {}} />)
  fireEvent.change(screen.getByLabelText('Batch name'), { target: { value: 'Example batch' } })
  fireEvent.click(screen.getByRole('button', { name: 'Select all accounts' }))
  fireEvent.change(screen.getByLabelText('Shared requested amount ($, optional)'), {
    target: { value: '1000' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Apply to selected' }))
  fireEvent.change(screen.getByLabelText('Account 1 requested amount ($)'), {
    target: { value: '750' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save record' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(
    save.mock.calls[0][0].values.entries.map((v: { requestedCents: number }) => v.requestedCents),
  ).toEqual([100000, 75000, 100000, 100000])
})

it('applies shared profit/loss explicitly and preserves independent corrections', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(<DailyResultsForm accounts={accounts} save={save} close={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Select all accounts' }))
  fireEvent.change(screen.getByLabelText('Session timestamp (your device time)'), {
    target: { value: '2026-10-10T15:00' },
  })
  for (const [key, value] of [
    ['Profit', '350'],
    ['Loss', '100'],
    ['Fees', '2.50'],
  ])
    fireEvent.change(screen.getByLabelText(`Shared ${key} ($)`), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply to selected accounts' }))
  fireEvent.change(screen.getByLabelText('Account 1 Loss ($)'), { target: { value: '400' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save 4 daily results' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0].values.map((v: { grossCents: number }) => v.grossCents)).toEqual([
    25000, -5000, 25000, 25000,
  ])
})
