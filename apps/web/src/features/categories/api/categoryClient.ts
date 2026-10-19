import type { CategoryInput, FinancialCategory } from '@goxfinance/shared'
import { apiRequest } from '../../../lib/api'
const path = (home: string) => `households/${home}/categories`
export const listCategories = (home: string) =>
  apiRequest<{ categories: FinancialCategory[]; canManage: boolean }>(path(home))
export const createCategory = (home: string, input: CategoryInput) =>
  apiRequest<{ category: FinancialCategory }>(path(home), {
    method: 'POST',
    body: JSON.stringify(input),
  })
export const updateCategory = (
  home: string,
  category: FinancialCategory,
  input: CategoryInput & { archived: boolean },
) =>
  apiRequest<{ category: FinancialCategory }>(`${path(home)}/${category.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...input, revision: category.revision }),
  })
