// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { HouseholdMemberRequest } from '@goxfinance/shared'
import { NotificationProvider } from '../../../components/ui/Notifications'
import { PendingApprovals } from './PendingApprovals'
import * as client from '../api/householdClient'

vi.mock('../api/householdClient', () => ({ listMemberRequests: vi.fn(), approveMemberRequest: vi.fn(), rejectMemberRequest: vi.fn() }))
const request: HouseholdMemberRequest = {
  id: 'e0d51ea0-7ec5-4ec2-ab14-c8a46661b400', householdId: '8d2f1919-6954-425b-bccf-b1db9b1904b5',
  proposedByUserId: 'ea946b91-8e84-4e51-8571-0bb6f32dc267', proposedByName: 'Admin', fullName: 'Blair',
  relationship: 'spouse', notes: 'Lives here', status: 'pending', reviewedByUserId: null, reviewedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(client.listMemberRequests).mockResolvedValue({ requests: [request] }) })
afterEach(cleanup)

describe('pending approvals', () => {
  it('shows proposal details and confirms an approval with a selected role', async () => {
    vi.mocked(client.approveMemberRequest).mockResolvedValue({ member: {} as Awaited<ReturnType<typeof client.approveMemberRequest>>['member'] })
    const onMembersChanged = vi.fn(async () => {})
    render(<NotificationProvider><PendingApprovals householdId={request.householdId} onMembersChanged={onMembersChanged} /></NotificationProvider>)
    expect(await screen.findByText('Blair')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Review details' }))
    expect(within(screen.getByRole('dialog')).getByText('Lives here')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }))
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('combobox', { name: /Planned access role/ }), { target: { value: 'editor' } })
    expect(client.approveMemberRequest).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm approval' }))
    await waitFor(() => expect(client.approveMemberRequest).toHaveBeenCalledWith(request.householdId, request.id, 'editor'))
    expect(onMembersChanged).toHaveBeenCalledOnce()
  })

  it('requires confirmation to reject and leaves the request visible when saving fails', async () => {
    vi.mocked(client.rejectMemberRequest).mockRejectedValue(new Error('Unable to reject'))
    render(<NotificationProvider><PendingApprovals householdId={request.householdId} onMembersChanged={async () => {}} /></NotificationProvider>)
    await screen.findByText('Blair')
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(client.rejectMemberRequest).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm rejection' }))
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('Unable to reject')).toBeTruthy())
    expect(screen.getByText('Blair')).toBeTruthy()
  })
})
