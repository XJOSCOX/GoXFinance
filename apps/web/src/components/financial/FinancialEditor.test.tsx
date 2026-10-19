// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { FinancialEditor } from './FinancialEditor'
import { Input } from '../ui'
afterEach(cleanup)
it('preserves inputs and submission key after failure and blocks concurrent submissions', async () => {
  let fail: (error: Error) => void = () => {}
  const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject
          }),
      )
      .mockResolvedValue(undefined),
    close = vi.fn()
  render(
    <FinancialEditor
      title="Fictional entry"
      build={(data) => ({ name: data.get('name') })}
      save={save}
      close={close}
    >
      <label>
        Name
        <Input name="name" />
      </label>
    </FinancialEditor>,
  )
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Keep this value' } })
  const form = screen.getByRole('button', { name: 'Save record' }).closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(save).toHaveBeenCalledOnce()
  fail(new Error('Database unavailable'))
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Database unavailable'),
  )
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Keep this value')
  expect(close).not.toHaveBeenCalled()
  fireEvent.submit(form)
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0].idempotencyKey).toBe(save.mock.calls[1][0].idempotencyKey)
})
