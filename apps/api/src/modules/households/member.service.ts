import { randomUUID } from 'node:crypto'
import { canManageHousehold, createMemberSchema, updateMemberSchema, type PublicUser } from '@goxfinance/shared'
import type { HouseholdRepository } from './household.repository'
import type { MemberRepository } from './member.repository'
import type { InvitationRepository } from './invitation.repository'
import { HouseholdError, requireHouseholdRole } from './household.permissions'

export function memberService(households: HouseholdRepository, members: MemberRepository, invitations: InvitationRepository) {
  function withInvitations(householdId: string, role: 'owner' | 'admin' | 'editor' | 'viewer') {
    const pending = new Map(invitations.listPending(householdId).map(row => [row.memberId, row]))
    return (member: ReturnType<MemberRepository['find']>) => {
      if (!member) return member
      const invitation = pending.get(member.id)
      return { ...member, invitation: invitation ? { id: invitation.id, memberId: invitation.memberId,
        status: invitation.status, createdAt: invitation.createdAt, expiresAt: invitation.expiresAt,
        ...(canManageHousehold(role, 'manageRoles') ? { role: invitation.role } : {}) } : null }
    }
  }
  function existing(householdId: string, memberId: string) {
    const member = members.find(householdId, memberId)
    if (!member) throw new HouseholdError('Member not found', 404)
    return member
  }

  return {
    list(user: PublicUser, householdId: string) {
      const role = requireHouseholdRole(households, householdId, user.id, 'view')
      return members.list(householdId).map(withInvitations(householdId, role))
    },
    get(user: PublicUser, householdId: string, memberId: string) {
      const role = requireHouseholdRole(households, householdId, user.id, 'view')
      return withInvitations(householdId, role)(existing(householdId, memberId))
    },
    create(user: PublicUser, householdId: string, input: unknown) {
      requireHouseholdRole(households, householdId, user.id, 'addMember')
      const values = createMemberSchema.parse(input)
      const now = new Date().toISOString()
      return members.create({ id: randomUUID(), householdId, linkedUserId: null,
        fullName: values.fullName, relationship: values.relationship, status: values.status,
        plannedAccessRole: values.plannedAccessRole, notes: values.notes ?? null, createdAt: now, updatedAt: now })
    },
    update(user: PublicUser, householdId: string, memberId: string, input: unknown) {
      requireHouseholdRole(households, householdId, user.id, 'editMember')
      const before = existing(householdId, memberId)
      if (before.accessRole === 'owner' || before.linkedUserId === households.findHousehold(householdId)?.createdByUserId) {
        throw new HouseholdError('The household Owner cannot be modified', 403)
      }
      const values = updateMemberSchema.parse(input)
      if (values.status === 'inactive') {
        requireHouseholdRole(households, householdId, user.id, 'removeMember')
        return members.deactivate(householdId, memberId, values)
      }
      if (values.status === 'active' && before.status === 'inactive') {
        requireHouseholdRole(households, householdId, user.id, 'removeMember')
      }
      return members.update(householdId, memberId, values)
    },
    deactivate(user: PublicUser, householdId: string, memberId: string) {
      requireHouseholdRole(households, householdId, user.id, 'removeMember')
      const before = existing(householdId, memberId)
      if (before.accessRole === 'owner' || before.linkedUserId === households.findHousehold(householdId)?.createdByUserId) {
        throw new HouseholdError('The household Owner cannot be modified', 403)
      }
      members.deactivate(householdId, memberId)
    },
  }
}

export type MemberService = ReturnType<typeof memberService>
