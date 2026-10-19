// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PaymentFormDialog } from './PaymentFormDialog'
import type { DebtPaymentInput } from '@goxfinance/shared'

afterEach(cleanup)
it('keeps financial input and the dialog open after a server rejection', async () => {
  const close = vi.fn(), save = vi.fn<(input: DebtPaymentInput) => Promise<void>>(async () => { throw new Error('Permission changed') })
  render(<PaymentFormDialog onClose={close} onSave={save}/>)
  fireEvent.change(screen.getByLabelText('Amount *'), { target: { value: '123.45' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save payment' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Permission changed'))
  expect(close).not.toHaveBeenCalled()
  expect((screen.getByLabelText('Amount *') as HTMLInputElement).value).toBe('123.45')
  expect(save.mock.calls[0]?.[0]).toMatchObject({ amountCents: 12345 })
})
