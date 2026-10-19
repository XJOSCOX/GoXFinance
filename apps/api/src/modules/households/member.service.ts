import { randomUUID } from 'node:crypto'
import { createMemberSchema, updateMemberSchema, type PublicUser } from '@goxfinance/shared'
import type { HouseholdRepository } from './household.repository'
import type { MemberRepository } from './member.repository'
import { HouseholdError, requireHouseholdRole } from './household.permissions'

export function memberService(households: HouseholdRepository, members: MemberRepository) {
  function existing(householdId: string, memberId: string) {
    const member = members.find(householdId, memberId)
    if (!member) throw new HouseholdError('Member not found', 404)
    return member
  }

  return {
    list(user: PublicUser, householdId: string) {
      requireHouseholdRole(households, householdId, user.id, 'view')
      return members.list(householdId)
    },
    get(user: PublicUser, householdId: string, memberId: string) {
      requireHouseholdRole(households, householdId, user.id, 'view')
      return existing(householdId, memberId)
    },
    create(user: PublicUser, householdId: string, input: unknown) {
      requireHouseholdRole(households, householdId, user.id, 'addMember')
      const values = createMemberSchema.parse(input)
      const now = new Date().toISOString()
      return members.create({ id: randomUUID(), householdId, linkedUserId: null,
        fullName: values.fullName, relationship: values.relationship, status: values.status,
        notes: values.notes ?? null, createdAt: now, updatedAt: now })
    },
    update(user: PublicUser, householdId: string, memberId: string, input: unknown) {
      requireHouseholdRole(households, householdId, user.id, 'editMember')
      const before = existing(householdId, memberId)
      const values = updateMemberSchema.parse(input)
      if (values.status === 'inactive' && before.status !== 'inactive') {
        requireHouseholdRole(households, householdId, user.id, 'removeMember')
        if (before.accessRole === 'owner') throw new HouseholdError('The household owner cannot be deactivated', 403)
      }
      return members.update(householdId, memberId, values)
    },
    deactivate(user: PublicUser, householdId: string, memberId: string) {
      requireHouseholdRole(households, householdId, user.id, 'removeMember')
      const before = existing(householdId, memberId)
      if (before.accessRole === 'owner') throw new HouseholdError('The household owner cannot be deactivated', 403)
      if (before.status !== 'inactive') members.update(householdId, memberId, { status: 'inactive' })
    },
  }
}

export type MemberService = ReturnType<typeof memberService>
