import { proposeMemberSchema, reviewMemberRequestSchema, type PublicUser } from '@goxfinance/shared'
import type { HouseholdRepository } from './household.repository'
import type { MemberRequestRepository } from './member-request.repository'
import type { MemberRepository } from './member.repository'
import { HouseholdError, requireHouseholdRole } from './household.permissions'

export function memberRequestService(households: HouseholdRepository, requests: MemberRequestRepository, members: MemberRepository) {
  return {
    list(user: PublicUser, householdId: string) {
      requireHouseholdRole(households, householdId, user.id, 'manageRoles')
      return requests.list(householdId)
    },
    submit(user: PublicUser, householdId: string, input: unknown) {
      requireHouseholdRole(households, householdId, user.id, 'proposeMember')
      const values = proposeMemberSchema.parse(input)
      if (requests.findRepeat(householdId, user.id, values.fullName, values.relationship)
        || requests.findExistingMember(householdId, values.fullName, values.relationship)) {
        throw new HouseholdError('This member is already in the household or under review', 409)
      }
      const created = requests.submit(householdId, user.id, values)
      if (!created) throw new HouseholdError('This member is already in the household or under review', 409)
      return { ...created, proposedByName: user.fullName }
    },
    approve(user: PublicUser, householdId: string, requestId: string, input: unknown) {
      requireHouseholdRole(households, householdId, user.id, 'manageRoles')
      const { role } = reviewMemberRequestSchema.parse(input)
      const result = requests.review(householdId, requestId, user.id, 'approved', role)
      if (!result?.memberId) throw new HouseholdError('Member request is no longer pending', 409)
      return members.find(householdId, result.memberId)!
    },
    reject(user: PublicUser, householdId: string, requestId: string) {
      requireHouseholdRole(households, householdId, user.id, 'manageRoles')
      if (!requests.review(householdId, requestId, user.id, 'rejected')) {
        throw new HouseholdError('Member request is no longer pending', 409)
      }
    },
    cancel(user: PublicUser, householdId: string, requestId: string) {
      requireHouseholdRole(households, householdId, user.id, 'proposeMember')
      if (!requests.cancel(householdId, requestId, user.id)) throw new HouseholdError('Member request is no longer pending', 409)
    },
  }
}
export type MemberRequestService = ReturnType<typeof memberRequestService>
