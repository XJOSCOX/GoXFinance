import type {
  IncomeData,
  IncomeSource,
  IncomeSourceInput,
  IncomeTransaction,
  IncomeTransactionInput,
  IncomeAudit,
} from '@goxfinance/shared'
import { apiRequest } from '../../../lib/api'
const path = (home: string) => `households/${home}/income`
export const listIncome = (home: string) => apiRequest<IncomeData>(path(home))
export const incomeDetails = (home: string, id: string) =>
  apiRequest<{ source: IncomeSource; audit: IncomeAudit[] }>(`${path(home)}/sources/${id}`)
export const saveSource = (
  home: string,
  values: IncomeSourceInput,
  key: string,
  existing?: IncomeSource,
  reason?: string,
) =>
  apiRequest(`${path(home)}/sources${existing ? '/' + existing.id : ''}`, {
    method: existing ? 'PATCH' : 'POST',
    body: JSON.stringify(
      existing ? { values, revision: existing.revision, reason } : { values, idempotencyKey: key },
    ),
  })
export const archiveSource = (home: string, source: IncomeSource) =>
  apiRequest(`${path(home)}/sources/${source.id}/archive`, {
    method: 'POST',
    body: JSON.stringify({ revision: source.revision, isArchived: !source.isArchived }),
  })
export const saveIncome = (
  home: string,
  values: IncomeTransactionInput,
  key: string,
  existing?: IncomeTransaction,
  reason?: string,
) =>
  apiRequest(`${path(home)}/transactions${existing ? '/' + existing.id : ''}`, {
    method: existing ? 'PATCH' : 'POST',
    body: JSON.stringify(
      existing ? { values, revision: existing.revision, reason } : { values, idempotencyKey: key },
    ),
  })
