import type { IncomeService } from '../income/income.service'
import {
  calculateBillSummary,
  overviewPayments,
  incomeSummary,
  cashOutflows,
  localBillDate,
  sumCents,
  type PublicUser,
} from '@goxfinance/shared'
import type { DebtService } from '../debts/debt.service'
import type { BillService } from '../bills/bill.service'
import type { expenseService } from '../expenses/expense.service'
import type { overviewRepository } from './overview.repository'

export function overviewService(
  store: ReturnType<typeof overviewRepository>,
  debts: DebtService,
  bills: BillService,
  expenses: ReturnType<typeof expenseService>,
  income: IncomeService,
) {
  return {
    get(user: PublicUser, householdId: string, month: string) {
      const debtList = debts.list(user, householdId),
        billList = bills.list(user, householdId),
        expenseList = expenses.list(user, householdId)
      const payments = store.payments(householdId)
      const outflows = cashOutflows(
        expenseList.expenses,
        billList.flatMap((item) => item.payments),
        payments,
      ).filter((item) => item.date.startsWith(month))
      const received = incomeSummary(
        income.list(user, householdId).transactions,
        month,
        localBillDate(),
      ).confirmedCents
      const paid = sumCents(outflows.map((item) => item.cashOutflowCents))
      return {
        income: { confirmedCents: received, netRecordedCashFlowCents: sumCents([received, -paid]) },
        month,
        payments: overviewPayments(billList, debtList.debts, payments, month),
        debts: debtList,
        bills: calculateBillSummary(billList, debtList.debts, localBillDate()),
        actual: {
          spendingCents: sumCents(outflows.map((item) => item.spendingCents)),
          cashOutflowCents: sumCents(outflows.map((item) => item.cashOutflowCents)),
          transactionCount: outflows.length,
        },
        upcoming: billList
          .filter((bill) => bill.status !== 'cancelled')
          .flatMap((bill) =>
            bill.periods.map((period) => ({ ...period, billId: bill.id, billName: bill.name })),
          )
          .filter(
            (period) =>
              !['paid', 'credited', 'overpaid', 'cancelled'].includes(period.paymentStatus),
          )
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
          .slice(0, 8),
        expenses: expenseList.expenses.filter(
          (item) =>
            !item.voided &&
            item.transactionDate <= localBillDate() &&
            item.transactionDate.startsWith(month),
        ),
        categories: expenseList.categories,
      }
    },
  }
}
