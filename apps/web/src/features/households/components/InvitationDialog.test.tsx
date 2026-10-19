// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { HouseholdMember } from '@goxfinance/shared'
import { NotificationProvider } from '../../../components/ui/Notifications'
import { InvitationDialog } from './InvitationDialog'
import * as client from '../api/householdClient'

vi.mock('../api/householdClient', () => ({
  generateInvitation: vi.fn(), regenerateInvitation: vi.fn(), revokeInvitation: vi.fn(),
}))

const member: HouseholdMember = {
  id: '7d268315-a1b6-43f1-a0c5-c8261ea18b78', householdId: '8d2f1919-6954-425b-bccf-b1db9b1904b5',
  linkedUserId: null, fullName: 'Blair', relationship: 'spouse', status: 'active', notes: null,
  accessRole: null, plannedAccessRole: 'viewer', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', invitation: null,
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

function open(onChanged = vi.fn(async () => {})) {
  render(<NotificationProvider><InvitationDialog householdId={member.householdId} member={member}
    onClose={() => {}} onChanged={onChanged} /></NotificationProvider>)
  return onChanged
}

describe('invitation feedback', () => {
  it('shows a confirmation only after persistence and exposes the new code for copying', async () => {
    vi.mocked(client.generateInvitation).mockResolvedValue({ code: 'test-code-only-shown-once', invitation: {
      id: '580cefd8-1932-447d-8535-a24df7d2cf33', memberId: member.id, role: 'viewer', status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z',
    } })
    const changed = open()
    fireEvent.click(screen.getByRole('button', { name: 'Generate invitation' }))
    expect(await screen.findByDisplayValue('test-code-only-shown-once')).toBeTruthy()
    expect(screen.getByText('Invitation generated successfully')).toBeTruthy()
    expect(changed).toHaveBeenCalledOnce()
  })

  it('keeps the dialog and planned role when saving fails', async () => {
    vi.mocked(client.generateInvitation).mockRejectedValue(new Error('Unable to save changes'))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Generate invitation' }))
    await waitFor(() => expect(screen.getByText('Planned access:')).toBeTruthy())
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getAllByText('Unable to save changes').length).toBeGreaterThan(0)
    expect(screen.queryByText('Invitation generated successfully')).toBeNull()
  })
})
