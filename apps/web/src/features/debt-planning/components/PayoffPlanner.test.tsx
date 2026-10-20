// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Debt } from '@goxfinance/shared'
import { PayoffPlanner } from './PayoffPlanner'
afterEach(cleanup)
it('keeps missing APR incomplete until an explicit assumption is entered and never edits debts', async () => {
  const debt = {
    id: '10000000-0000-4000-8000-000000000001',
    householdId: 'home',
    isArchived: false,
    currentBalanceCents: 10000,
    minimumPaymentCents: 5000,
    interestRateApr: null,
    confidence: 'unverified',
    creditorName: 'Fictional card',
    memberAssignments: [],
  } as unknown as Debt
  const save = vi.fn().mockResolvedValue(undefined)
  render(<PayoffPlanner debts={[debt]} save={save} />)
  expect(screen.getByText(/Incomplete projection:/)).toBeTruthy()
  fireEvent.click(screen.getByText('Explicit scenario assumptions & custom order'))
  fireEvent.change(screen.getByLabelText('Assumed APR (%)'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Update projection' }))
  expect(screen.queryByText(/Incomplete projection:/)).toBeNull()
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save projected scenario snapshot' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0].assumptions).toEqual([{ debtId: debt.id, apr: '0' }])
  expect(debt.interestRateApr).toBeNull()
})
