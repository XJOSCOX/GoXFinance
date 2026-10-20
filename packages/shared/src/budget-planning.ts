import type { BillView } from './bills'
import type { FinancialCategory } from './categories'
import { sumCents } from './outflows'
import { budgetMonthSchema } from './budgets'

export type BudgetBillDraft = {
  rows: {
    billId: string
    name: string
    dueDate: string
    amountCents: number | null
    basis: string
    included: boolean
  }[]
  limits: { categoryId: string; amountCents: number }[]
  totalCents: number
}

/** Calendar-month obligations, not monthly equivalents or actual spending. No records are created. */
export function budgetFromBills(
  bills: BillView[],
  categories: FinancialCategory[],
  month: string,
  member: string | null,
): BudgetBillDraft {
  budgetMonthSchema.parse(month)
  const rows: BudgetBillDraft['rows'] = [],
    totals = new Map<string, number>()
  for (const bill of new Map(bills.map((b) => [b.id, b])).values()) {
    if (bill.status !== 'active' || (member && !bill.memberIds.includes(member))) continue
    const dates = new Set(
      bill.periods.filter((p) => p.dueDate.startsWith(month)).map((p) => p.dueDate),
    )
    const anchor = new Date(bill.nextDueDate + 'T00:00:00Z')
    const last = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
    ).getUTCDate()
    for (let day = 1; day <= last; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`
      if (date < bill.nextDueDate || (bill.endDate && date > bill.endDate)) continue
      const d = new Date(date + 'T00:00:00Z')
      const months =
        (d.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + d.getUTCMonth() - anchor.getUTCMonth()
      const interval = bill.frequency === 'quarterly' ? 3 : bill.frequency === 'annually' ? 12 : 1
      const scheduled =
        bill.kind === 'one_time'
          ? date === bill.nextDueDate
          : bill.frequency === 'weekly' || bill.frequency === 'biweekly'
            ? ((d.getTime() - anchor.getTime()) / 86400000) %
                (bill.frequency === 'weekly' ? 7 : 14) ===
              0
            : !!bill.frequency &&
              months % interval === 0 &&
              day === Math.min(anchor.getUTCDate(), last)
      if (scheduled) dates.add(date)
    }
    for (const date of [...dates].sort()) {
      const p = bill.periods.find((p) => p.dueDate === date)
      if (p?.paymentStatus === 'cancelled') continue
      const amount =
        p?.amountCents ??
        (bill.amountType === 'variable'
          ? (p?.budgetEstimateCents ?? p?.estimatedAmountCents ?? bill.estimatedAmountCents)
          : bill.amountCents)
      const categoryId = p ? p.categoryId : bill.categoryId
      const category = categories.find((c) => c.id === categoryId && !c.archived)
      const debtLinked = p ? p.linkedDebtId : bill.linkedDebtId
      const included = !debtLinked && !!category && amount !== null
      const basis = debtLinked
        ? 'Excluded: debt payment transfer'
        : !category
          ? 'Excluded: choose an active category on the bill'
          : amount === null
            ? 'Excluded: amount unknown'
            : p?.amountCents !== null && p?.amountCents !== undefined
              ? 'Actual billed amount (planning only)'
              : bill.amountType === 'variable'
                ? 'Saved estimate'
                : 'Fixed bill amount'
      rows.push({
        billId: bill.id,
        name: p?.name ?? bill.name,
        dueDate: date,
        amountCents: amount,
        basis,
        included,
      })
      if (included) totals.set(category!.id, sumCents([totals.get(category!.id) ?? 0, amount!]))
    }
  }
  const limits = [...totals].map(([categoryId, amountCents]) => ({ categoryId, amountCents }))
  return { rows, limits, totalCents: sumCents(limits.map((l) => l.amountCents)) }
}
