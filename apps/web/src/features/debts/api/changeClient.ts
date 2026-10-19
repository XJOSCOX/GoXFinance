import type { DebtChangeInput, DebtChangeRequest } from '@goxfinance/shared'
import { apiRequest } from '../../../lib/api'

export const listDebtChanges = (householdId: string) => apiRequest<{ requests: DebtChangeRequest[] }>(`households/${householdId}/debt-change-requests`)
export const submitDebtChange = (householdId: string, debtId: string, input: DebtChangeInput) =>
  apiRequest<{ requestId: string }>(`households/${householdId}/debts/${debtId}/change-requests`, { method: 'POST', body: JSON.stringify(input) })
export const reviewDebtChange = (householdId: string, requestId: string, action: 'approve' | 'reject' | 'cancel', note: string | null) =>
  apiRequest(`households/${householdId}/debt-change-requests/${requestId}/${action}`, { method: 'POST', body: JSON.stringify({ confirmed: true, note }) })
