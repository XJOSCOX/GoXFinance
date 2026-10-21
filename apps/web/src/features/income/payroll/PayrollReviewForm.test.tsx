// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PayrollReviewForm } from './PayrollReviewForm'
import type { PayrollStatement } from '@goxfinance/shared'
afterEach(cleanup)
const statement: PayrollStatement = {
  employer: 'Fictional Payroll',
  assignment: null,
  periodStart: '2026-10-05',
  periodEnd: '2026-10-11',
  payDate: '2026-10-16',
  grossCents: 100000,
  deductionsCents: 20000,
  netCents: 80000,
  acknowledgement: null,
  lines: [
    {
      label: 'Regular',
      side: 'earnings',
      code: 'regular',
      treatment: 'not_applicable',
      currentCents: 100000,
      ytdCents: 400000,
      rateCents: 2500,
      hoursHundredths: 4000,
      worked: true,
      confidence: 'high',
    },
    {
      label: 'Federal',
      side: 'deduction',
      code: 'federal',
      treatment: 'posttax',
      currentCents: 20000,
      ytdCents: 80000,
      rateCents: null,
      hoursHundredths: null,
      worked: null,
      confidence: 'high',
    },
  ],
}
it('saves a reconciled upload with one confirmation, collapsed details and stable retry inputs', async () => {
  const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Synthetic database failure'))
      .mockResolvedValue(undefined),
    close = vi.fn()
  render(<PayrollReviewForm initial={statement} warnings={[]} save={save} close={close} />)
  expect(screen.queryByLabelText('Review / correction note')).toBeNull()
  expect(screen.getByText('Detailed lines, classifications & YTD').closest('details')!.open).toBe(
    false,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save Paycheck' }))
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Synthetic database failure'),
  )
  expect(save.mock.calls[0][0].values).toMatchObject({
    grossCents: 100000,
    netCents: 80000,
    lines: statement.lines,
  })
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save Paycheck' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(save.mock.calls[1][0].idempotencyKey).toBe(save.mock.calls[0][0].idempotencyKey)
})
