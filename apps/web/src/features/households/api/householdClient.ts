import type { HouseholdMember, HouseholdSummary, InvitationRole, InvitationSummary, MemberStatus, Relationship } from '@goxfinance/shared'
import { apiRequest } from '../../../lib/api'

const path = (householdId: string) => `households/${householdId}`
const memberPath = (householdId: string, memberId: string) => `${path(householdId)}/members/${memberId}`

export type MemberInput = { fullName: string; relationship: Relationship; status: MemberStatus; notes?: string | null }

export const listHouseholds = () => apiRequest<{ households: HouseholdSummary[] }>('households')
export const createHousehold = (name: string) => apiRequest<{ household: HouseholdSummary }>('households', {
  method: 'POST', body: JSON.stringify({ name }),
})
export const getHousehold = (id: string) => apiRequest<{ household: HouseholdSummary }>(path(id))
export const updateHousehold = (id: string, changes: { name?: string; moveInDate?: string | null; notes?: string | null }) => apiRequest<{ household: HouseholdSummary }>(path(id), {
  method: 'PATCH', body: JSON.stringify(changes),
})
export const listMembers = (id: string) => apiRequest<{ members: HouseholdMember[] }>(`${path(id)}/members`)
export const getMember = (householdId: string, memberId: string) => apiRequest<{ member: HouseholdMember }>(memberPath(householdId, memberId))
export const createMember = (householdId: string, input: MemberInput) => apiRequest<{ member: HouseholdMember }>(`${path(householdId)}/members`, {
  method: 'POST', body: JSON.stringify(input),
})
export const updateMember = (householdId: string, memberId: string, input: MemberInput) => apiRequest<{ member: HouseholdMember }>(memberPath(householdId, memberId), {
  method: 'PATCH', body: JSON.stringify(input),
})
export const deactivateMember = (householdId: string, memberId: string) => apiRequest<void>(memberPath(householdId, memberId), { method: 'DELETE' })
export const generateInvitation = (householdId: string, memberId: string, role: InvitationRole) =>
  apiRequest<{ invitation: InvitationSummary; code: string }>(`${memberPath(householdId, memberId)}/invitations`, { method: 'POST', body: JSON.stringify({ role }) })
export const regenerateInvitation = (householdId: string, memberId: string, invitationId: string) =>
  apiRequest<{ invitation: InvitationSummary; code: string }>(`${memberPath(householdId, memberId)}/invitations/${invitationId}/regenerate`, { method: 'POST', body: '{}' })
export const revokeInvitation = (householdId: string, memberId: string, invitationId: string) =>
  apiRequest<void>(`${memberPath(householdId, memberId)}/invitations/${invitationId}`, { method: 'DELETE' })
export const redeemInvitation = (code: string) =>
  apiRequest<{ household: { householdId: string; memberId: string; role: InvitationRole } }>('household-invitations/redeem', { method: 'POST', body: JSON.stringify({ code }) })
