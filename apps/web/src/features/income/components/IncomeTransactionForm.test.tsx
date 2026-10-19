// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IncomeSource, IncomeTransaction } from '@goxfinance/shared'
import { IncomeTransactionForm } from './IncomeTransactionForm'
import { initialIncome } from './income-form-values'
afterEach(cleanup)
const source = {
  id: crypto.randomUUID(),
  name: 'Fictional job',
  incomeType: 'hourly',
  frequency: 'weekly',
  payday: 4,
  hourlyRateCents: 2500,
  overtimeMultiplier: '1',
  expectedGrossCents: null,
  expectedNetCents: null,
} as IncomeSource
it('does not invent hours or deposits and retains inputs and idempotency after save fails', async () => {
  const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockResolvedValue(undefined),
    close = vi.fn()
  render(<IncomeTransactionForm sources={[source]} save={save} close={close} />)
  expect((screen.getByLabelText('Regular hours') as HTMLInputElement).value).toBe('')
  expect((screen.getByLabelText('Actual net deposited ($)') as HTMLInputElement).value).toBe('')
  fireEvent.change(screen.getByLabelText('Regular hours'), { target: { value: '27.5' } })
  fireEvent.change(screen.getByLabelText('Overtime hours'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Overtime multiplier'), { target: { value: '1.5' } })
  expect(screen.getByText('$762.50')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Save income' }))
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Database unavailable'),
  )
  expect(close).not.toHaveBeenCalled()
  expect((screen.getByLabelText('Regular hours') as HTMLInputElement).value).toBe('27.5')
  fireEvent.click(screen.getByRole('button', { name: 'Save income' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[0][1]).toBe(save.mock.calls[1][1])
  expect(save.mock.calls[1][0]).toMatchObject({
    regularHours: '27.5',
    status: 'pending',
    actualNetCents: null,
  })
})
it('requires actual deposited amount, receipt confirmation and exact cents', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(<IncomeTransactionForm sources={[source]} save={save} close={() => {}} />)
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'confirmed' } })
  const form = screen.getByRole('button', { name: 'Confirm deposit' }).closest('form')!
  fireEvent.submit(form)
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Actual net deposited ($)'), {
    target: { value: '690.001' },
  })
  fireEvent.change(screen.getByLabelText('Deposit date'), { target: { value: '2026-10-08' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /I confirm this net amount/ }))
  fireEvent.submit(form)
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('two decimal places'))
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Actual net deposited ($)'), {
    target: { value: '690.01' },
  })
  fireEvent.submit(form)
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0]).toMatchObject({
    actualNetCents: 69001,
    depositDate: '2026-10-08',
    status: 'confirmed',
    receiptConfirmed: true,
  })
})
it('uses the historical rate rather than a changed source rate when correcting a paycheck', () => {
  const original = initialIncome(source),
    existing = {
      ...original,
      id: crypto.randomUUID(),
      hourlyRateCents: 2000,
      regularHours: '25',
      incomeTypeSnapshot: 'hourly',
      frequencySnapshot: 'weekly',
      status: 'confirmed',
      receiptConfirmed: true,
    } as IncomeTransaction
  render(
    <IncomeTransactionForm
      sources={[{ ...source, hourlyRateCents: 3000 }]}
      existing={existing}
      save={vi.fn()}
      close={() => {}}
    />,
  )
  expect(
    (screen.getByLabelText('Hourly rate for this paycheck ($)') as HTMLInputElement).value,
  ).toBe('20.00')
  expect(
    (screen.getByRole('checkbox', { name: /I confirm this net amount/ }) as HTMLInputElement)
      .checked,
  ).toBe(false)
})
