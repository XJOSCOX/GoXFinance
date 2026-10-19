import type { BillView } from './bills'
import type { Debt } from './debts'
import type { DebtPayment } from './debt-payments'
import type { Expense } from './expenses'
import { billMonthlyCents } from './bill-calculations'
import { debtObligationGroups, representativeDebtBalance } from './debt-calculations'
import { cashOutflows, sumCents } from './outflows'
import { localBillDate } from './financial-dates'

export function categoryReport(
  bills: BillView[],
  debts: Debt[],
  expenses: Expense[],
  payments: DebtPayment[],
  month: string,
  today = localBillDate(),
) {
  type Row = {
    categoryId: string | null
    expectedCents: number
    spendingCents: number
    cashOutflowCents: number
    debtBalanceCents: number
    unknownExpectedCount: number
    unknownDebtCount: number
  }
  const rows = new Map<string | null, Row>()
  function row(id?: string | null) {
    const key = id ?? null
    if (!rows.has(key))
      rows.set(key, {
        categoryId: key,
        expectedCents: 0,
        spendingCents: 0,
        cashOutflowCents: 0,
        debtBalanceCents: 0,
        unknownExpectedCount: 0,
        unknownDebtCount: 0,
      })
    return rows.get(key)!
  }
  function add(
    id: string | null | undefined,
    field: 'expectedCents' | 'spendingCents' | 'cashOutflowCents' | 'debtBalanceCents',
    amount: number,
  ) {
    const target = row(id)
    target[field] = sumCents([target[field], amount])
  }
  const recurring = bills.filter(
    (bill) =>
      bill.status === 'active' &&
      bill.kind === 'recurring' &&
      (!bill.endDate || bill.endDate >= today),
  )
  const monthly = (bill: BillView) =>
    billMonthlyCents(
      bill.amountType === 'variable' ? bill.estimatedAmountCents : bill.amountCents,
      bill.frequency,
    )
  const used = new Set<string>()
  for (const group of debtObligationGroups(debts)) {
    const selected = representativeDebtBalance(group)
    if (selected.currentBalanceCents === null) row(selected.categoryId).unknownDebtCount++
    else add(selected.categoryId, 'debtBalanceCents', selected.currentBalanceCents)
    const linked = recurring.filter((bill) => group.some((debt) => debt.id === bill.linkedDebtId))
    linked.forEach((bill) => used.add(bill.id))
    const known = linked
      .map((bill) => ({ bill, amount: monthly(bill) }))
      .filter((item) => item.amount !== null)
      .sort((a, b) => b.amount! - a.amount!)
    const amount =
      known[0]?.amount ?? Math.max(...group.map((debt) => debt.minimumPaymentCents ?? 0))
    const id = known[0]?.bill.categoryId ?? selected.categoryId
    add(id, 'expectedCents', amount)
    if (!known.length && group.every((debt) => debt.minimumPaymentCents === null))
      row(id).unknownExpectedCount++
  }
  for (const bill of recurring.filter((bill) => !used.has(bill.id))) {
    const amount = monthly(bill)
    if (amount === null) row(bill.categoryId).unknownExpectedCount++
    else add(bill.categoryId, 'expectedCents', amount)
  }
  const billPayments = bills.flatMap((bill) => bill.payments)
  for (const transaction of cashOutflows(expenses, billPayments, payments, today).filter((item) =>
    item.date.startsWith(month),
  )) {
    if (transaction.source === 'expense') {
      const expense = expenses.find((item) => item.id === transaction.id)!
      for (const allocation of expense.allocations) {
        add(allocation.categoryId, 'spendingCents', allocation.amountCents)
        if (transaction.cashOutflowCents > 0)
          add(allocation.categoryId, 'cashOutflowCents', allocation.amountCents)
      }
    } else {
      const payment =
        transaction.source === 'debt'
          ? billPayments.find((item) => item.debtPaymentId === transaction.id)
          : billPayments.find((item) => item.id === transaction.id)
      const bill = payment ? bills.find((item) => item.id === payment.billId) : undefined
      const period = bill?.periods.find((item) => item.id === payment?.periodId)
      const debtPayment =
        transaction.source === 'debt'
          ? payments.find((item) => item.id === transaction.id)
          : undefined
      const id =
        period?.categoryId ??
        bill?.categoryId ??
        debts.find((item) => item.id === debtPayment?.debtId)?.categoryId
      add(id, 'spendingCents', transaction.spendingCents)
      add(id, 'cashOutflowCents', transaction.cashOutflowCents)
    }
  }
  return [...rows.values()]
}
