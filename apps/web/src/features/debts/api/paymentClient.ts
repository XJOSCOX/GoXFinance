import type { DebtBalanceHistory, DebtPayment, DebtPaymentInput, DebtPaymentOverview } from '@goxfinance/shared'
import { apiRequest } from '../../../lib/api'

const path = (householdId: string, debtId: string) => `households/${householdId}/debts/${debtId}`
export type PaymentAuditEntry = { id: string; action: string; actorUserId: string; createdAt: string }
export const listPayments = (householdId: string, debtId: string) =>
  apiRequest<{ payments: DebtPayment[]; overview: DebtPaymentOverview }>(`${path(householdId, debtId)}/payments`)
export const getPayment = (householdId: string, debtId: string, paymentId: string) =>
  apiRequest<{ payment: DebtPayment; audit: PaymentAuditEntry[] }>(`${path(householdId, debtId)}/payments/${paymentId}`)
export const createPayment = (householdId: string, debtId: string, input: DebtPaymentInput) =>
  apiRequest<{ payment: DebtPayment }>(`${path(householdId, debtId)}/payments`, { method: 'POST', body: JSON.stringify(input) })
export const updatePayment = (householdId: string, debtId: string, paymentId: string, input: Omit<DebtPaymentInput, 'idempotencyKey'>) =>
  apiRequest<{ payment: DebtPayment }>(`${path(householdId, debtId)}/payments/${paymentId}`, { method: 'PATCH', body: JSON.stringify(input) })
export const cancelPayment = (householdId: string, debtId: string, paymentId: string) =>
  apiRequest<{ payment: DebtPayment }>(`${path(householdId, debtId)}/payments/${paymentId}/cancel`, { method: 'POST', body: '{}' })
export const confirmPayment = (householdId: string, debtId: string, paymentId: string) =>
  apiRequest<{ payment: DebtPayment }>(`${path(householdId, debtId)}/payments/${paymentId}/confirm`, { method: 'POST', body: '{}' })
export const listBalanceHistory = (householdId: string, debtId: string) =>
  apiRequest<{ history: DebtBalanceHistory[]; overview: DebtPaymentOverview }>(`${path(householdId, debtId)}/balances`)
export const verifyDebtBalance = (householdId: string, debtId: string, input: {
  balanceCents: number; effectiveDate: string; source: 'creditor_statement' | 'reconciliation'; notes: string | null
}) => apiRequest<{ entry: DebtBalanceHistory; overview: DebtPaymentOverview }>(`${path(householdId, debtId)}/balances`,
  { method: 'POST', body: JSON.stringify(input) })
