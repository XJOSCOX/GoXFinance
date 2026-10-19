import type { Expense, ExpenseAudit, ExpenseCategory, ExpenseInput } from '@goxfinance/shared'
import { apiRequest } from '../../../lib/api'
const path = (home: string) => `households/${home}/expenses`
export const initializeExpenses = (home: string) =>
  apiRequest(path(home) + '/initialize', { method: 'POST', body: '{}' })
export const listExpenses = (home: string) =>
  apiRequest<{ expenses: Expense[]; categories: ExpenseCategory[] }>(path(home))
export const getExpense = (home: string, id: string) =>
  apiRequest<{ expense: Expense; audit: ExpenseAudit[] }>(`${path(home)}/${id}`)
export const saveExpense = (
  home: string,
  input: ExpenseInput,
  idempotencyKey: string,
  existing?: Expense,
) =>
  apiRequest<{ expense: Expense }>(path(home) + (existing ? '/' + existing.id : ''), {
    method: existing ? 'PATCH' : 'POST',
    body: JSON.stringify(
      existing
        ? { expense: input, revision: existing.revision }
        : { expense: input, idempotencyKey },
    ),
  })
export const voidExpense = (home: string, expense: Expense) =>
  apiRequest(`${path(home)}/${expense.id}`, {
    method: 'DELETE',
    body: JSON.stringify({ revision: expense.revision }),
  })
