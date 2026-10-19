import { canManageHousehold, type HouseholdPermission } from '@goxfinance/shared'
import type { HouseholdRepository } from './household.repository'

export class HouseholdError extends Error {
  constructor(message: string, public statusCode: number) { super(message) }
}

export function requireHouseholdRole(repository: HouseholdRepository, householdId: string, userId: string, permission: HouseholdPermission) {
  const assignment = repository.findRole(householdId, userId)
  if (!assignment) throw new HouseholdError('Household not found', 404)
  if (!canManageHousehold(assignment.role, permission)) throw new HouseholdError('Permission denied', 403)
  return assignment.role
}
