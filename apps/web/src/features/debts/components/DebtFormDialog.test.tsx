// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createDebtSchema, type Debt, type HouseholdMember } from '@goxfinance/shared'
import { DebtFormDialog } from './DebtFormDialog'

afterEach(cleanup)
const members: HouseholdMember[] = ['owner', 'editor'].map((role, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`, householdId: 'home', linkedUserId: role,
  fullName: role === 'owner' ? 'Test Owner' : 'Test Editor', relationship: 'other', status: 'active', notes: null,
  accessRole: role as 'owner' | 'editor', plannedAccessRole: 'viewer', createdAt: '', updatedAt: '',
}))
const debt: Debt = { ...createDebtSchema.parse({ creditorName: 'Fictional lender', accountType: 'auto_loan', currentBalanceCents: 100000,
  memberAssignments: members.map(member => ({ memberId: member.id, responsibility: 'joint' })) }),
  id: 'debt', householdId: 'home', createdByUserId: 'owner', isArchived: false, createdAt: '', updatedAt: '' }

it('collects a reason and proposed assignments while leaving balance changes in Balance History', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Submission unavailable'))
  render(<DebtFormDialog debt={debt} members={members} debts={[debt]} role="editor" currentMemberId={members[1].id}
    requestMode onSave={save} onClose={() => {}}/>)
  expect(screen.queryByRole('button', { name: 'Save debt' })).toBeNull()
  expect((screen.getByLabelText('Current balance ($)') as HTMLInputElement).disabled).toBe(true)
  expect((screen.getByRole('checkbox', { name: 'Test Owner' }) as HTMLInputElement).disabled).toBe(false)
  fireEvent.change(screen.getByLabelText('Creditor *'), { target: { value: 'Proposed creditor' } })
  fireEvent.change(screen.getByLabelText('Test Owner responsibility'), { target: { value: 'primary' } })
  fireEvent.change(screen.getByLabelText('Reason for Owner approval *'), { target: { value: 'Correct statement identity' } })
  fireEvent.click(screen.getByRole('button', { name: 'Request approval' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0]).toMatchObject({ creditorName: 'Proposed creditor', currentBalanceCents: 100000,
    memberAssignments: expect.arrayContaining([{ memberId: members[0].id, responsibility: 'primary' }]) })
  expect(save.mock.calls[0][1]).toBe('Correct statement identity')
  expect(screen.getByRole('alert').textContent).toContain('Submission unavailable')
  expect((screen.getByLabelText('Creditor *') as HTMLInputElement).value).toBe('Proposed creditor')
  fireEvent.click(screen.getByRole('button', { name: 'Request approval' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[1][2]).toBe(save.mock.calls[0][2])
})
