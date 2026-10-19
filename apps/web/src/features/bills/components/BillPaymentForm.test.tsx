// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BillPeriodView } from '@goxfinance/shared'
import { BillPaymentForm } from './BillPaymentForm'
afterEach(cleanup)
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
  expect(screen.getByText('Budget estimate: $300.00')).toBeTruthy()
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
