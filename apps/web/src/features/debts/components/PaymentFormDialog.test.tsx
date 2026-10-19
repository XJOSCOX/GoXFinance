// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PaymentFormDialog } from './PaymentFormDialog'
import type { Debt, DebtPaymentInput } from '@goxfinance/shared'

afterEach(cleanup)
const debt = {
  currentBalanceCents: 12345,
  minimumPaymentCents: 500,
  pastDueAmountCents: 1000,
} as Debt
it('prefills each debt preset, permits review edits, and leaves principal unknown on full-balance selection', () => {
  render(<PaymentFormDialog debt={debt} onClose={() => {}} onSave={vi.fn()} />)
  const amount = screen.getByLabelText('Amount *') as HTMLInputElement
  fireEvent.click(screen.getByRole('radio', { name: /Monthly minimum/ }))
  expect(amount.value).toBe('5.00')
  fireEvent.click(screen.getByRole('radio', { name: /Past-due amount/ }))
  expect(amount.value).toBe('10.00')
  fireEvent.click(screen.getByRole('radio', { name: /Full outstanding/ }))
  expect(amount.value).toBe('123.45')
  expect(screen.getByText(/Confirm the final payoff amount with the creditor/)).toBeTruthy()
  expect((screen.getByLabelText('Principal') as HTMLInputElement).value).toBe('')
  fireEvent.change(amount, { target: { value: '125.67' } })
  expect(amount.value).toBe('125.67')
})
it('requires explicit cleared confirmation and rejects excessive decimal precision', async () => {
  const save = vi.fn()
  render(<PaymentFormDialog debt={debt} onClose={() => {}} onSave={save} />)
  fireEvent.click(screen.getByRole('radio', { name: /Full outstanding/ }))
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'completed' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save payment' }).closest('form')!)
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox', { name: /actually cleared/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save payment' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0]).toMatchObject({
    paymentStatus: 'completed',
    amountCents: 12345,
    principalAmountCents: null,
  })
})
it('keeps unavailable presets disabled and hides completed recording for Owner-review obligations', () => {
  render(
    <PaymentFormDialog
      debt={{ ...debt, currentBalanceCents: null, minimumPaymentCents: 0 }}
      allowCompleted={false}
      onClose={() => {}}
      onSave={vi.fn()}
    />,
  )
  expect(
    (screen.getByRole('radio', { name: /Full outstanding/ }) as HTMLInputElement).disabled,
  ).toBe(true)
  expect(
    (screen.getByRole('radio', { name: /Monthly minimum/ }) as HTMLInputElement).disabled,
  ).toBe(true)
  expect(screen.queryByRole('option', { name: 'Completed' })).toBeNull()
})
it('keeps financial input and the dialog open after a server rejection', async () => {
  const close = vi.fn(),
    save = vi.fn<(input: DebtPaymentInput) => Promise<void>>(async () => {
      throw new Error('Permission changed')
    })
  render(<PaymentFormDialog onClose={close} onSave={save} />)
  fireEvent.change(screen.getByLabelText('Amount *'), { target: { value: '123.45' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save payment' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Permission changed'))
  expect(close).not.toHaveBeenCalled()
  expect((screen.getByLabelText('Amount *') as HTMLInputElement).value).toBe('123.45')
  expect(save.mock.calls[0]?.[0]).toMatchObject({ amountCents: 12345 })
})
