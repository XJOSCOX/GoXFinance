import { z } from 'zod'
export const reportKinds = [
  'banking',
  'all',
  'income_spending',
  'budgets',
  'debts',
  'settlements',
  'cash_flow',
  'forecasts',
  'net_worth',
  'trading',
  'goals',
] as const
export const reportKindLabels: Record<(typeof reportKinds)[number], string> = {
  banking: 'Bank observations & reconciliation',
  all: 'All financial reports',
  income_spending: 'Income & spending',
  budgets: 'Budget performance',
  debts: 'Debt & payoff progress',
  settlements: 'Settlements',
  cash_flow: 'Cash flow & bill obligations',
  forecasts: 'Forecast scenarios',
  net_worth: 'Assets & net worth',
  trading: 'Trading & payouts',
  goals: 'Goal progress',
}
export const reportFilterSchema = z
  .object({
    kind: z.enum(reportKinds),
    from: z.iso.date(),
    to: z.iso.date(),
    memberId: z.uuid().nullable(),
    categoryId: z.uuid().nullable(),
    debtId: z.uuid().nullable(),
    accountId: z.uuid().nullable(),
    groupId: z.uuid().nullable(),
  })
  .strict()
  .refine(
    (v) =>
      v.to >= v.from &&
      v.from >= '1900-01-01' &&
      v.to <= '9998-12-31' &&
      Date.parse(v.to) - Date.parse(v.from) <= 3660 * 86400000,
    'Choose a date range of up to ten years',
  )
export type ReportFilters = z.infer<typeof reportFilterSchema>
export type ReportValue = string | number | boolean | null
export type ReportTable = {
  name: string
  basis: string
  columns: { key: string; label: string; unit: 'text' | 'cents' | 'number' }[]
  rows: Record<string, ReportValue>[]
}
export type FinancialReport = {
  schemaVersion: 1
  kind: 'financial_report_export'
  restorable: false
  generatedAt: string
  householdId: string
  householdName: string
  scope: string
  filters: ReportFilters
  notes: string[]
  tables: ReportTable[]
}
export type ReportOptions = {
  owner: boolean
  selfId: string | null
  members: { id: string; name: string }[]
  categories: { id: string; name: string }[]
  debts: { id: string; name: string }[]
  accounts: { id: string; name: string }[]
  groups: { id: string; name: string }[]
}
export function reportDisplay(value: ReportValue, unit: ReportTable['columns'][number]['unit']) {
  if (value === null) return 'Unknown'
  if (unit === 'cents' && typeof value === 'number') {
    const n = BigInt(value),
      a = n < 0n ? -n : n
    return `${n < 0n ? '-' : ''}$${(a / 100n).toLocaleString('en-US')}.${String(a % 100n).padStart(2, '0')}`
  }
  return typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
}
