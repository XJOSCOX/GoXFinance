// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PayrollDepositConfirmation } from './PayrollDepositConfirmation'
afterEach(cleanup)
it('defaults to the printed payday and confirms once without a second dialog or checkbox', async () => {
  let release!: () => void
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  render(<PayrollDepositConfirmation date="2026-10-16" amountCents={80000} save={save} />)
  expect((screen.getByLabelText('Deposit date') as HTMLInputElement).value).toBe('2026-10-16')
  expect(screen.queryByRole('checkbox')).toBeNull()
  fireEvent.change(screen.getByLabelText('Deposit date'), { target: { value: '2026-10-17' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm received' }))
  fireEvent.submit(screen.getByRole('button', { name: 'Saving�' }).closest('form')!)
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith({ date: '2026-10-17', amountCents: 80000 })
  release()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm received' })).toBeTruthy())
})
it('preserves edited amounts and date after persistence fails and rejects imprecise money', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Database unavailable'))
  render(<PayrollDepositConfirmation date="2026-10-16" amountCents={80000} save={save} />)
  fireEvent.change(screen.getByLabelText('Net received ($)'), { target: { value: '790.123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm received' }))
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Net received ($)'), { target: { value: '790.12' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm received' }))
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Database unavailable'),
  )
  expect((screen.getByLabelText('Net received ($)') as HTMLInputElement).value).toBe('790.12')
})
