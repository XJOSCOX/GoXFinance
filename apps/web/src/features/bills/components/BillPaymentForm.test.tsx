// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BillPeriodView } from '@goxfinance/shared'
import { BillPaymentForm } from './BillPaymentForm'
afterEach(cleanup)
it('prefills actual billed and remaining amounts, supports custom edits and requires cleared confirmation', async () => {
  const period = {
    dueDate: '2026-10-01',
    amountCents: 34218,
    estimatedAmountCents: 30000,
    remainingCents: 14218,
  } as BillPeriodView
  const save = vi.fn()
  render(<BillPaymentForm period={period} save={save} close={() => {}} />)
  const amount = screen.getByLabelText('Actual payment amount ($)') as HTMLInputElement
  fireEvent.click(screen.getByRole('radio', { name: /Full billed amount/ }))
  expect(amount.value).toBe('342.18')
  fireEvent.click(screen.getByRole('radio', { name: /Remaining unpaid amount/ }))
  expect(amount.value).toBe('142.18')
  fireEvent.click(screen.getByRole('radio', { name: /Other amount/ }))
  fireEvent.change(amount, { target: { value: '100.001' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save pending payment' }))
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toContain('two decimal places')
  fireEvent.change(amount, { target: { value: '100.01' } })
  fireEvent.change(screen.getByLabelText('Payment status'), { target: { value: 'completed' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save payment' }).closest('form')!)
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox', { name: /actually cleared/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save payment' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0]).toMatchObject({
    amountCents: 10001,
    status: 'completed',
    principalAmountCents: null,
  })
})
it('never fills a payment from an estimate and retains input after failed persistence', async () => {
  const period = {
    id: 'period',
    dueDate: '2026-10-01',
    amountCents: null,
    estimatedAmountCents: 30000,
    remainingCents: null,
  } as BillPeriodView
  const save = vi.fn().mockRejectedValue(new Error('Database unavailable')),
    close = vi.fn()
  render(<BillPaymentForm period={period} save={save} close={close} />)
  const amount = screen.getByLabelText('Actual payment amount ($)') as HTMLInputElement
  expect(amount.value).toBe('')
  expect(screen.getByText('Budget estimate')).toBeTruthy()
  expect(screen.getByText('$300.00')).toBeTruthy()
  fireEvent.change(amount, { target: { value: '200' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save pending payment' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0].amountCents).toBe(20000)
  expect(screen.getByRole('alert').textContent).toContain('Database unavailable')
  expect(amount.value).toBe('200')
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save pending payment' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[0][0].idempotencyKey).toBe(save.mock.calls[1][0].idempotencyKey)
})

it('explicitly confirms the billed total separately from a partial payment', async () => {
  const period = {
    dueDate: '2026-10-01',
    amountCents: null,
    estimatedAmountCents: 30000,
    paidCents: 0,
    creditCents: 0,
    remainingCents: null,
  } as BillPeriodView
  const save = vi.fn()
  render(<BillPaymentForm period={period} billRevision={3} save={save} close={() => {}} />)
  expect((screen.getByLabelText('Actual payment amount ($)') as HTMLInputElement).value).toBe('')
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirm the actual bill total/ }))
  const billed = screen.getByLabelText('Confirmed bill total ($)') as HTMLInputElement
  expect(billed.value).toBe('')
  fireEvent.change(billed, { target: { value: '342.18' } })
  fireEvent.click(screen.getByRole('radio', { name: /Full billed amount/ }))
  expect((screen.getByLabelText('Actual payment amount ($)') as HTMLInputElement).value).toBe(
    '342.18',
  )
  fireEvent.change(screen.getByLabelText('Actual payment amount ($)'), { target: { value: '200' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save pending payment' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0]).toMatchObject({
    amountCents: 20000,
    status: 'pending',
    billAmountConfirmation: { amountCents: 34218, expectedRevision: 3 },
  })
})
