import type {
  BillAction,
  BillAuditEntry,
  BillChangeRequest,
  BillInput,
  BillPaymentInput,
  BillView,
} from '@goxfinance/shared'
import { apiRequest } from '../../../lib/api'
const path = (home: string) => `households/${home}/bills`
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) })
export const listBills = (home: string) => apiRequest<{ bills: BillView[] }>(path(home))
export const refreshBills = (home: string) => apiRequest(path(home) + '/refresh', post({}))
export const createBill = (home: string, input: BillInput) =>
  apiRequest<{ bill: BillView }>(path(home), post(input))
export const applyBillAction = (home: string, id: string, action: BillAction) =>
  apiRequest<{ bill: BillView }>(`${path(home)}/${id}/actions`, post(action))
export const getBill = (home: string, id: string) =>
  apiRequest<{ bill: BillView; audit: BillAuditEntry[] }>(`${path(home)}/${id}`)
export const recordBillPayment = (
  home: string,
  id: string,
  periodId: string,
  input: BillPaymentInput,
) => apiRequest<{ bill: BillView }>(`${path(home)}/${id}/periods/${periodId}/payments`, post(input))
export const listBillRequests = (home: string) =>
  apiRequest<{ requests: BillChangeRequest[] }>(path(home) + '/requests')
export const requestBillAction = (
  home: string,
  id: string,
  proposal: BillAction,
  reason: string,
  idempotencyKey: string,
) => apiRequest(`${path(home)}/${id}/requests`, post({ proposal, reason, idempotencyKey }))
export const reviewBillRequest = (
  home: string,
  id: string,
  action: 'approve' | 'reject' | 'cancel',
) => apiRequest(`${path(home)}/requests/${id}/review`, post({ action }))
