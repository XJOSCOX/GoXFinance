// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { billInputSchema, type BillView, type HouseholdMember } from '@goxfinance/shared'
import { BillForm } from './BillForm'
afterEach(cleanup)

it('preserves optional bill settings while editing with additional details collapsed', async () => {
  const memberId = crypto.randomUUID()
  const values = billInputSchema.parse({
    name: 'Example utility',
    category: 'Utilities',
    kind: 'recurring',
    amountType: 'variable',
    amountCents: null,
    linkedDebtId: null,
    estimatedAmountCents: 30000,
    frequency: 'monthly',
    nextDueDate: '2026-10-25',
    endDate: '2027-10-25',
    autoPay: true,
    status: 'active',
    notes: 'Keep this note',
    memberIds: [memberId],
  })
  const save = vi.fn().mockResolvedValue(undefined)
  render(
    <BillForm
      bill={{ ...values, id: crypto.randomUUID() } as BillView}
      members={[{ id: memberId, fullName: 'Example member', status: 'active' } as HouseholdMember]}
      debts={[]}
      save={save}
      close={() => {}}
    />,
  )
  expect(screen.getByText('Additional details').closest('details')?.open).toBe(false)
  fireEvent.change(screen.getByLabelText('Bill name'), { target: { value: 'Renamed utility' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save bill' }).closest('form')!)
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0]).toEqual({ ...values, name: 'Renamed utility' })
})
