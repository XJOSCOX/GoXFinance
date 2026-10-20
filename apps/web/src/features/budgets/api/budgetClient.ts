import type { BudgetReport } from '@goxfinance/shared'
import { apiRequest } from '../../../lib/api'
const base = (home: string) => `households/${home}/budgets`
export const listBudgets = (home: string, month: string, member: string) =>
  apiRequest<BudgetReport>(`${base(home)}?month=${month}${member ? '&member=' + member : ''}`)
export const saveBudget = (home: string, body: unknown, id?: string) =>
  apiRequest(base(home) + (id ? '/' + id : ''), {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  })
export const copyBudget = (home: string, body: unknown) =>
  apiRequest(base(home) + '/copy', { method: 'POST', body: JSON.stringify(body) })
