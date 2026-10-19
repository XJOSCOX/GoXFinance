import { debtObligationGroups } from './debt-calculations'
import type { Debt } from './debts'
import type { Bill, BillPayment, BillPeriod, BillPeriodView, BillView } from './bills'

export { localBillDate } from './financial-dates'
import { roundCentsRatio } from './money-calculations'
const safe = (value: number) => {
  if (!Number.isSafeInteger(value)) throw new Error('Amount exceeds the supported range')
  return value
}
export function billMonthlyCents(amount: number | null, frequency: Bill['frequency']) {
  if (amount === null || frequency === null) return null
  const [numerator, denominator] = {
    weekly: [52, 12],
    biweekly: [26, 12],
    monthly: [1, 1],
    quarterly: [1, 3],
    annually: [1, 12],
  }[frequency]
  return roundCentsRatio(amount, numerator, denominator)
}

// Always calculate from the original anchor: Jan 31 -> Feb 28 -> Mar 31.
export function billScheduleDates(
  bill: Pick<Bill, 'kind' | 'nextDueDate' | 'frequency' | 'endDate'>,
  through: string,
) {
  if (bill.kind === 'one_time') return [bill.nextDueDate]
  const anchor = new Date(bill.nextDueDate + 'T00:00:00.000Z'),
    dates: string[] = []
  for (let index = 0; index < 10000; index++) {
    let date: Date
    if (bill.frequency === 'weekly' || bill.frequency === 'biweekly')
      date = new Date(anchor.getTime() + index * (bill.frequency === 'weekly' ? 7 : 14) * 86400000)
    else {
      const months =
        index * (bill.frequency === 'monthly' ? 1 : bill.frequency === 'quarterly' ? 3 : 12)
      const month = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1))
      const lastDay = new Date(
        Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
      ).getUTCDate()
      date = new Date(
        Date.UTC(
          month.getUTCFullYear(),
          month.getUTCMonth(),
          Math.min(anchor.getUTCDate(), lastDay),
        ),
      )
    }
    const key = date.toISOString().slice(0, 10)
    if (bill.endDate && key > bill.endDate) return dates
    dates.push(key)
    if (key > through) return dates // Include exactly the next upcoming period.
  }
  throw new Error('Schedule is too long; choose a more recent starting date')
}
export function billPeriodView(
  period: BillPeriod,
  payments: BillPayment[],
  cancelled: boolean,
  today: string,
): BillPeriodView {
  const paidCents = payments
    .filter(
      (payment) =>
        payment.periodId === period.id &&
        payment.status === 'completed' &&
        payment.paymentDate <= today,
    )
    .reduce((sum, payment) => safe(sum + payment.amountCents), 0)
  const amount = period.amountCents // Estimates are never actual amounts owed.
  const settled = safe(paidCents + period.creditCents)
  const remainingCents = amount === null ? null : Math.max(0, amount - settled)
  const paymentStatus = cancelled
    ? 'cancelled'
    : amount !== null && settled > amount
      ? 'overpaid'
      : amount !== null && settled >= amount
        ? period.creditCents > 0
          ? 'credited'
          : 'paid'
        : settled > 0
          ? 'partially_paid'
          : 'unpaid'
  return {
    ...period,
    paidCents,
    remainingCents,
    overpaidCents: amount === null ? 0 : Math.max(0, settled - amount),
    amountIsEstimate: period.amountCents === null && period.estimatedAmountCents !== null,
    paymentStatus,
    overdue:
      !cancelled &&
      !['paid', 'credited', 'overpaid'].includes(paymentStatus) &&
      period.dueDate < today,
  }
}
// Read-only fallback for current/future periods created before an estimate was entered.
// Stored snapshots and earlier months remain unchanged.
export function billBudgetEstimate(bill: Bill, period: BillPeriodView, today: string) {
  if (period.estimatedAmountCents !== null) return period.estimatedAmountCents
  if (
    bill.amountType !== 'variable' ||
    bill.status !== 'active' ||
    period.dueDate < today.slice(0, 7) + '-01' ||
    period.paymentStatus === 'cancelled'
  )
    return null
  return bill.estimatedAmountCents
}

export function billAverage(periods: BillPeriodView[], count: 3 | 6 | 12) {
  const sample = periods
    .filter(
      (period) =>
        period.amountCents !== null &&
        ['paid', 'overpaid', 'credited'].includes(period.paymentStatus),
    )
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, count)
  return {
    sampleCount: sample.length,
    averageCents: sample.length
      ? roundCentsRatio(
          sample.reduce((sum, period) => safe(sum + period.amountCents!), 0),
          1,
          sample.length,
        )
      : null,
  }
}
export function calculateBillSummary(bills: BillView[], debts: Debt[], today: string) {
  const active = bills.filter((bill) => bill.status === 'active')
  const recurring = active.filter(
    (bill) => bill.kind === 'recurring' && (!bill.endDate || bill.endDate >= today),
  )
  const monthly = (bill: Bill) =>
    billMonthlyCents(
      bill.amountType === 'variable' ? bill.estimatedAmountCents : bill.amountCents,
      bill.frequency,
    )
  const standaloneMonthlyCents = recurring
    .filter((bill) => !bill.linkedDebtId)
    .reduce((sum, bill) => safe(sum + (monthly(bill) ?? 0)), 0)
  const groups = debtObligationGroups(debts)
  let debtAndLinkedMonthlyCents = 0
  const counted = new Set<string>()
  for (const group of groups) {
    const linked = recurring.filter((bill) => group.some((debt) => debt.id === bill.linkedDebtId))
    for (const bill of linked) counted.add(bill.id)
    // A linked bill replaces, rather than supplements, the same debt minimum.
    const known = linked.map(monthly).filter((amount): amount is number => amount !== null)
    const amount = known.length
      ? Math.max(...known)
      : Math.max(...group.map((debt) => debt.minimumPaymentCents ?? 0))
    debtAndLinkedMonthlyCents = safe(debtAndLinkedMonthlyCents + amount)
  }
  for (const bill of recurring.filter((item) => item.linkedDebtId && !counted.has(item.id)))
    debtAndLinkedMonthlyCents = safe(debtAndLinkedMonthlyCents + (monthly(bill) ?? 0))
  // Stopping a recurring schedule does not erase existing amounts owed.
  const periods = bills
    .filter((bill) => bill.status !== 'cancelled')
    .flatMap((bill) => bill.periods)
  return {
    standaloneMonthlyCents,
    debtAndLinkedMonthlyCents,
    householdMonthlyObligationsCents: safe(standaloneMonthlyCents + debtAndLinkedMonthlyCents),
    unknownRecurringCount: recurring.filter((bill) => monthly(bill) === null).length,
    estimatedRecurringCount: recurring.filter((bill) => bill.amountType === 'variable').length,
    overdueCount: periods.filter((period) => period.overdue).length,
    unknownPeriodCount: periods.filter((period) => period.amountCents === null).length,
    confirmedPeriodCount: periods.filter((period) => period.amountCents !== null).length,
    outstandingCents: periods
      .filter((period) => period.paymentStatus !== 'cancelled')
      .reduce((sum, period) => safe(sum + (period.remainingCents ?? 0)), 0),
  }
}
