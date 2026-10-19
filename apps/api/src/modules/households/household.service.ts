import { createHouseholdSchema, updateHouseholdSchema, type HouseholdSummary, type PublicUser } from '@goxfinance/shared'
import type { HouseholdRepository } from './household.repository'
import { requireHouseholdRole } from './household.permissions'

export function householdService(repository: HouseholdRepository) {
  function summary(household: { id: string; name: string; createdAt: string; updatedAt: string }, role: HouseholdSummary['role']): HouseholdSummary {
    return { id: household.id, name: household.name, role, createdAt: household.createdAt, updatedAt: household.updatedAt }
  }

  return {
    list(user: PublicUser) {
      return repository.listForUser(user.id).map(row => summary(row.household, row.role))
    },
    create(user: PublicUser, input: unknown) {
      const { name } = createHouseholdSchema.parse(input)
      const result = repository.createInitial(user, name)
      return { household: summary(result.household, result.role), created: result.created }
    },
    get(user: PublicUser, householdId: string) {
      const role = requireHouseholdRole(repository, householdId, user.id, 'view')
      const household = repository.findHousehold(householdId)!
      return summary(household, role)
    },
    update(user: PublicUser, householdId: string, input: unknown) {
      const role = requireHouseholdRole(repository, householdId, user.id, 'manageSettings')
      const { name } = updateHouseholdSchema.parse(input)
      return summary(repository.updateName(householdId, name), role)
    },
  }
}

export type HouseholdService = ReturnType<typeof householdService>
