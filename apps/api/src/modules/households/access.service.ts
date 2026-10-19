import { updateMemberRoleSchema, type PublicUser } from '@goxfinance/shared'
import type { HouseholdRepository } from './household.repository'
import type { MemberRepository } from './member.repository'
import type { AccessRepository } from './access.repository'
import { HouseholdError, requireHouseholdRole } from './household.permissions'

export function accessService(households: HouseholdRepository, members: MemberRepository, access: AccessRepository) {
  return {
    updateRole(user: PublicUser, householdId: string, memberId: string, input: unknown) {
      requireHouseholdRole(households, householdId, user.id, 'manageRoles')
      const { role } = updateMemberRoleSchema.parse(input)
      const member = members.find(householdId, memberId)
      if (!member) throw new HouseholdError('Household member not found', 404)
      if (member.accessRole === 'owner' || member.linkedUserId === households.findHousehold(householdId)?.createdByUserId) {
        throw new HouseholdError('The household Owner cannot be modified', 403)
      }
      if (member.linkedUserId === user.id) throw new HouseholdError('You cannot change your own role', 403)
      if (member.status !== 'active') throw new HouseholdError('Inactive members cannot receive roles', 409)
      if (member.linkedUserId) {
        if (!member.accessRole) throw new HouseholdError('Member has no active role', 409)
        if (member.accessRole !== role) access.changeActive(householdId, memberId, member.linkedUserId,
          user.id, member.accessRole, role)
      } else if (member.plannedAccessRole !== role) {
        access.changePlanned(householdId, memberId, user.id, member.plannedAccessRole, role)
      }
      return members.find(householdId, memberId)!
    },
  }
}
export type AccessService = ReturnType<typeof accessService>
