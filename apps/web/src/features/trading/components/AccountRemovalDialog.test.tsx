// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { TradingAccount } from '@goxfinance/shared'
import { AccountRemovalDialog } from './AccountRemovalDialog'

afterEach(cleanup)
it('requires a matching account name for permanent deletion and retains errors', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Account has linked history'))
  const close = vi.fn()
  render(
    <AccountRemovalDialog
      account={{ nickname: 'Extra account', deletedAt: null } as TradingAccount}
      save={save}
      close={close}
    />,
  )
  fireEvent.click(screen.getByLabelText('Delete permanently instead'))
  expect(
    (screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.change(screen.getByLabelText('Type Extra account to confirm'), {
    target: { value: 'Extra account' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toBe('Account has linked history'),
  )
  expect(save).toHaveBeenCalledWith(true)
  expect(close).not.toHaveBeenCalled()
})
