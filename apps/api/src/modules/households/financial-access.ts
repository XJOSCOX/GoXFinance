import type { PublicUser } from '@goxfinance/shared'
import type { HouseholdRepository } from './household.repository'
import type { MemberRepository } from './member.repository'

export class FinancialError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message)
  }
}

// Shared household context only. Feature-specific authorization stays in its service.
export function financialAccess(homes: HouseholdRepository, members: MemberRepository) {
  return {
    context(user: Pick<PublicUser, 'id'>, householdId: string) {
      const role = homes.findRole(householdId, user.id)?.role,
        home = homes.findHousehold(householdId)
      if (!role || !home) throw new FinancialError('Household not found', 404)
      const people = members.list(householdId)
      const self = people.find(
        (member) => member.linkedUserId === user.id && member.status === 'active',
      )
      return { role, home, people, self }
    },
  }
}
export type FinancialAccess = ReturnType<typeof financialAccess>
