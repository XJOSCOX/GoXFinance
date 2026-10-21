import type { IncomeSource, IncomeTransaction } from '@goxfinance/shared'
export const incomeHistoryDate = (t: IncomeTransaction) =>
  t.status === 'confirmed' ? (t.depositDate ?? t.payDate) : t.payDate
export function filterIncomeHistory(
  transactions: IncomeTransaction[],
  sources: IncomeSource[],
  filters: { month?: string; member?: string; status?: string; query?: string } = {},
) {
  const query = (filters.query ?? '').trim().toLowerCase()
  return transactions.filter(
    (t) =>
      (!filters.month || incomeHistoryDate(t).startsWith(filters.month)) &&
      (!filters.member || t.responsibleMemberId === filters.member) &&
      (!filters.status || t.status === filters.status) &&
      (sources.find((s) => s.id === t.sourceId)?.name ?? '').toLowerCase().includes(query),
  )
}
