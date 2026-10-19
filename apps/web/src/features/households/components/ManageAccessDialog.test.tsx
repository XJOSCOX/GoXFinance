// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { HouseholdMember } from '@goxfinance/shared'
import { NotificationProvider } from '../../../components/ui/Notifications'
import { ManageAccessDialog } from './ManageAccessDialog'
import * as client from '../api/householdClient'

vi.mock('../api/householdClient', () => ({ updateMemberRole: vi.fn() }))
const member: HouseholdMember = {
  id: '7d268315-a1b6-43f1-a0c5-c8261ea18b78', householdId: '8d2f1919-6954-425b-bccf-b1db9b1904b5',
  linkedUserId: null, fullName: 'Blair', relationship: 'spouse', status: 'active', notes: null,
  accessRole: null, plannedAccessRole: 'viewer', createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z', invitation: { id: '996e07e7-3acb-4b1e-b912-766c4d37ea7d',
    memberId: '7d268315-a1b6-43f1-a0c5-c8261ea18b78', role: 'viewer', status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z' },
}
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('member access dialog', () => {
  it('requires a changed role and confirmation, then reports invitation invalidation', async () => {
    vi.mocked(client.updateMemberRole).mockResolvedValue({ member: { ...member, plannedAccessRole: 'editor' } })
    const changed = vi.fn(async () => {})
    render(<NotificationProvider><ManageAccessDialog householdId={member.householdId} member={member}
      onClose={() => {}} onChanged={changed} /></NotificationProvider>)
    expect(screen.getByRole('button', { name: 'Save access' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('radio', { name: /editor/i }))
    expect(screen.getByText(/Changing this role revokes/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save access' }))
    expect(client.updateMemberRole).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    await waitFor(() => expect(client.updateMemberRole).toHaveBeenCalledWith(member.householdId, member.id, 'editor'))
    expect(changed).toHaveBeenCalledOnce()
  })

  it('preserves the selected role after a failed update', async () => {
    vi.mocked(client.updateMemberRole).mockRejectedValue(new Error('Unable to update role'))
    render(<NotificationProvider><ManageAccessDialog householdId={member.householdId} member={member}
      onClose={() => {}} onChanged={async () => {}} /></NotificationProvider>)
    fireEvent.click(screen.getByRole('radio', { name: /admin/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save access' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    await waitFor(() => expect(screen.getAllByText('Unable to update role').length).toBeGreaterThan(0))
    expect(screen.getByRole('radio', { name: /admin/i })).toHaveProperty('checked', true)
  })
})
