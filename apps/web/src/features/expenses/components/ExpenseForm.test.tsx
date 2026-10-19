// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { randomUUID } from 'node:crypto'
import type { Expense, ExpenseCategory, HouseholdMember } from '@goxfinance/shared'
import { ExpenseForm } from './ExpenseForm'
afterEach(cleanup)

it('preserves historical splits on edit and retains the correction when saving fails', async () => {
  const home = randomUUID(),
    member = {
      id: randomUUID(),
      householdId: home,
      fullName: 'Fictional Owner',
      status: 'active',
    } as HouseholdMember
  const categories: ExpenseCategory[] = ['Groceries', 'Household Supplies'].map((name) => ({
    id: randomUUID(),
    householdId: home,
    name,
    createdAt: '',
  }))
  const expense: Expense = {
    id: randomUUID(),
    householdId: home,
    responsibleMemberId: member.id,
    description: 'Fictional purchase',
    merchant: 'Example market',
    amountCents: 12550,
    transactionDate: '2026-10-01',
    paymentMethod: 'cash',
    linkedDebtId: null,
    notes: null,
    allocations: [
      { categoryId: categories[0].id, amountCents: 10000 },
      { categoryId: categories[1].id, amountCents: 2550 },
    ],
    createdByUserId: randomUUID(),
    createdAt: '',
    updatedAt: '',
    voided: false,
    revision: 1,
    canManage: true,
  }
  const save = vi.fn().mockRejectedValue(new Error('Save failed')),
    close = vi.fn()
  render(
    <ExpenseForm
      expense={expense}
      members={[member]}
      categories={categories}
      debts={[]}
      save={save}
      close={close}
    />,
  )
  fireEvent.change(screen.getByLabelText('Merchant (optional)'), {
    target: { value: 'Corrected market' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0]).toMatchObject({
    merchant: 'Corrected market',
    amountCents: 12550,
    allocations: expense.allocations,
  })
  expect(screen.getByRole('alert').textContent).toContain('Save failed')
  expect(close).not.toHaveBeenCalled()
})
