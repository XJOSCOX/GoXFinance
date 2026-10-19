import type { overviewPayments } from './overview-payments'
import type { debtPayoffProgress } from './debt-payoff-progress'
import type { BillPeriodView } from './bills'
import type { calculateBillSummary } from './bill-calculations'
import type { Debt } from './debts'
import type { DebtSummary } from './debt-calculations'
import type { Expense, ExpenseCategory } from './expenses'
export type HouseholdOverview = {
  debtProgress: ReturnType<typeof debtPayoffProgress>
  payments: ReturnType<typeof overviewPayments>
  income: { confirmedCents: number; netRecordedCashFlowCents: number }
  month: string
  debts: { debts: Debt[]; summary: DebtSummary }
  bills: ReturnType<typeof calculateBillSummary>
  actual: { spendingCents: number; cashOutflowCents: number; transactionCount: number }
  upcoming: (BillPeriodView & { billId: string; billName: string })[]
  expenses: Expense[]
  categories: ExpenseCategory[]
}
