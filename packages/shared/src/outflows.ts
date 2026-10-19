import { localBillDate } from './financial-dates'
import type { BillPayment } from './bills'
import type { DebtPayment } from './debt-payments'
import type { Expense } from './expenses'

export type Outflow = {
  id: string
  date: string
  source: 'expense' | 'bill' | 'debt'
  spendingCents: number
  cashOutflowCents: number
}
// Credit purchases are spending when purchased. Repayments are cash outflows,
// not a second purchase. A linked bill and debt payment share one transaction.
export function cashOutflows(
  expenses: Expense[],
  bills: BillPayment[],
  debts: DebtPayment[],
  today = localBillDate(),
): Outflow[] {
  const result: Outflow[] = []
  for (const expense of expenses.filter((item) => !item.voided && item.transactionDate <= today))
    result.push({
      id: expense.id,
      date: expense.transactionDate,
      source: 'expense',
      spendingCents: expense.amountCents,
      cashOutflowCents: expense.paymentMethod === 'credit_card' ? 0 : expense.amountCents,
    })
  const seen = new Set<string>()
  for (const debt of debts.filter(
    (item) => item.paymentStatus === 'completed' && item.paymentDate <= today,
  )) {
    if (seen.has(debt.id)) continue
    seen.add(debt.id)
    result.push({
      id: debt.id,
      date: debt.paymentDate,
      source: 'debt',
      spendingCents: 0,
      cashOutflowCents: debt.paymentMethod === 'credit_card' ? 0 : debt.amountCents,
    })
  }
  for (const bill of bills.filter(
    (item) => item.status === 'completed' && item.paymentDate <= today,
  )) {
    if (bill.debtPaymentId) continue // The authoritative debt payment above owns this outflow.
    result.push({
      id: bill.id,
      date: bill.paymentDate,
      source: 'bill',
      spendingCents: bill.amountCents,
      cashOutflowCents: bill.method === 'credit_card' ? 0 : bill.amountCents,
    })
  }
  return result
}
export function sumCents(values: number[]) {
  return values.reduce((sum, value) => {
    const total = sum + value
    if (!Number.isSafeInteger(total)) throw new Error('Total exceeds the supported range')
    return total
  }, 0)
}
