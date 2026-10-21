import type { BillView } from './bills'
import type { Expense } from './expenses'
import type { FinancialRefund } from './bank-review'
import type { FinancialCategory } from './categories'
import type { BudgetInput, BudgetCategoryRow, BudgetStatus } from './budgets'
import { cashOutflows, sumCents } from './outflows'
import { localBillDate } from './financial-dates'
export function previousBudgetMonth(month: string) {
  const d = new Date(month + '-01T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}
export function budgetUsage(limit: number, actual: number) {
  const status: BudgetStatus =
    actual > limit
      ? 'Over Budget'
      : actual === limit
        ? 'At Limit'
        : BigInt(actual) * 100n >= BigInt(limit) * 80n
          ? 'Approaching Limit'
          : 'Within Budget'
  return {
    remainingCents: Math.max(0, sumCents([limit, -actual])),
    overCents: Math.max(0, sumCents([actual, -limit])),
    percent: limit === 0 ? (actual > 0 ? 100 : 0) : (actual / limit) * 100,
    status,
  }
}
/** Purchase spending only. Member-linked bills are associations, never summed across scopes. */
export function budgetSpending(
  expenses: Expense[],
  bills: BillView[],
  month: string,
  member: string | null,
  today = localBillDate(),
  refunds: FinancialRefund[] = [],
) {
  const scopedExpenses = [
    ...new Map(
      expenses.filter((e) => !member || e.responsibleMemberId === member).map((e) => [e.id, e]),
    ).values(),
  ]
  const seen = new Set<string>()
  const scopedBills = bills
    .filter((b) => !member || b.memberIds.includes(member))
    .map((b) => ({
      ...b,
      categoryId: null, // Only the historical period category can classify a paid bill.
      payments: b.payments.filter((p) => {
        if (seen.has(p.id)) return false
        seen.add(p.id)
        // A debt obligation/payment is a transfer, even if its alias is incomplete.
        const period = b.periods.find((period) => period.id === p.periodId)
        return !p.debtPaymentId && !p.debtId && !(period ? period.linkedDebtId : b.linkedDebtId)
      }),
    }))
  const totals = new Map<string | null, number>()
  const add = (categoryId: string | null, amount: number) =>
    totals.set(categoryId, sumCents([totals.get(categoryId) ?? 0, amount]))
  const payments = scopedBills.flatMap((b) => b.payments)
  for (const transaction of cashOutflows(scopedExpenses, payments, [], today).filter((r) =>
    r.date.startsWith(month),
  )) {
    if (transaction.source === 'expense') {
      for (const allocation of scopedExpenses.find((e) => e.id === transaction.id)!.allocations)
        add(allocation.categoryId, allocation.amountCents)
    } else {
      const payment = payments.find((p) => p.id === transaction.id)!,
        bill = scopedBills.find((b) => b.id === payment.billId)
      add(
        bill?.periods.find((p) => p.id === payment.periodId)?.categoryId ?? null,
        transaction.spendingCents,
      )
    }
  }
  for (const r of refunds.filter(
    (r) =>
      r.status === 'completed' &&
      !r.debtPaymentId &&
      r.date <= today &&
      r.date.startsWith(month) &&
      (!member || r.memberIds.includes(member)),
  ))
    for (const a of r.allocations) add(a.categoryId, -a.amountCents)
  return [...totals].map(([categoryId, actualCents]) => ({ categoryId, actualCents }))
}
export function budgetCategoryRows(
  budget: BudgetInput | null,
  categories: FinancialCategory[],
  spending: { categoryId: string | null; actualCents: number }[],
): BudgetCategoryRow[] {
  const ids = new Set<string | null>([
    ...spending.filter((r) => r.actualCents !== 0).map((r) => r.categoryId),
    ...(budget?.limits.map((l) => l.categoryId) ?? []),
  ])
  return [...ids]
    .map((id) => {
      const category = categories.find((c) => c.id === id),
        limit = budget?.limits.find((l) => l.categoryId === id)?.amountCents ?? null,
        actual = sumCents(spending.filter((r) => r.categoryId === id).map((r) => r.actualCents))
      return {
        categoryId: id,
        name: category?.name ?? 'Uncategorized',
        archived: category?.archived ?? false,
        limitCents: limit,
        actualCents: actual,
        ...(limit === null
          ? { remainingCents: null, overCents: 0, percent: null, status: null }
          : budgetUsage(limit, actual)),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
export function budgetBillObligations(bills: BillView[], month: string, member: string | null) {
  return bills
    .filter((b) => !member || b.memberIds.includes(member))
    .flatMap((b) =>
      b.periods
        .filter((p) => p.dueDate.startsWith(month) && p.paymentStatus !== 'cancelled')
        .map((p) => ({
          id: p.id,
          name: b.name,
          dueDate: p.dueDate,
          estimateCents: p.budgetEstimateCents ?? p.estimatedAmountCents,
          billedCents: p.amountCents,
          paidCents: p.paidCents,
          remainingCents: p.remainingCents,
        })),
    )
}
