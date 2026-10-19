// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TradingAccount, TradingResult } from '@goxfinance/shared'
import { ResultForm } from './ResultForm'
import { ResultRemovalDialog } from './ResultRemovalDialog'
afterEach(cleanup)
const result = {
  id: 'result',
  accountId: '10000000-0000-4000-8000-000000000001',
  sessionAt: '2026-10-10T20:00:00Z',
  sessionDate: '2026-10-10',
  grossCents: -1000,
  feesCents: 100,
  profitCents: null,
  lossCents: null,
  revision: 2,
  timezone: 'America/Chicago',
  sessionStart: '08:30',
  tradeCount: null,
  notes: null,
} as TradingResult
it('keeps legacy breakdown unknown and preserves failed correction inputs', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Save failed'))
  render(
    <ResultForm
      result={result}
      accounts={[{ id: result.accountId, nickname: 'Example' } as TradingAccount]}
      save={save}
      close={() => {}}
    />,
  )
  expect(
    (screen.getByLabelText('Enter separate profit and loss') as HTMLInputElement).checked,
  ).toBe(false)
  fireEvent.change(screen.getByLabelText('Reason for correction'), {
    target: { value: 'Historical correction' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save record' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0].values).toMatchObject({
    grossCents: -1000,
    profitCents: null,
    lossCents: null,
  })
  expect(screen.getByRole('alert').textContent).toContain('Save failed')
  expect(
    (screen.getByLabelText('Gross realized P&L ($, losses negative)') as HTMLInputElement).value,
  ).toBe('-10.00')
})
it('requires explicit deletion confirmation and a reason with revision', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(<ResultRemovalDialog result={result} save={save} close={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete result' }))
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
  fireEvent.change(screen.getByLabelText('Reason for correction'), {
    target: { value: 'Duplicate fictional entry' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Delete result' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0]).toEqual({
    revision: 2,
    reason: 'Duplicate fictional entry',
    values: { confirmation: 'DELETE' },
  })
})
