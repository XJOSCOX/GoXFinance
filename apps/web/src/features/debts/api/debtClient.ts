import type { Debt, DebtInput } from '@goxfinance/shared'
import { apiRequest } from '../../../lib/api'

const path = (householdId: string) => `households/${householdId}/debts`
export const listDebts = (householdId: string) => apiRequest<{ debts: Debt[] }>(path(householdId))
export const createDebt = (householdId: string, input: DebtInput) => apiRequest<{ debt: Debt }>(path(householdId), {
  method: 'POST', body: JSON.stringify(input),
})
export const updateDebt = (householdId: string, debtId: string, input: DebtInput) => apiRequest<{ debt: Debt }>(`${path(householdId)}/${debtId}`, {
  method: 'PATCH', body: JSON.stringify(input),
})
export const archiveDebt = (householdId: string, debtId: string) => apiRequest<{ debt: Debt }>(`${path(householdId)}/${debtId}`, { method: 'DELETE' })
export const restoreDebt = (householdId: string, debtId: string) => apiRequest<{ debt: Debt }>(`${path(householdId)}/${debtId}/restore`, { method: 'POST', body: '{}' })
