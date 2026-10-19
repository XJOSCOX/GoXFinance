import { localBillDate } from './financial-dates'
import type { BillView } from './bills'
import type { Debt } from './debts'
import type { DebtPayment } from './debt-payments'
import { sumCents } from './outflows'
import { billProgress } from './bill-progress'

export type OverviewPayment = {
  id: string
  name: string
  source: 'bill' | 'debt'
  date: string
  amountCents: number
  status: DebtPayment['paymentStatus']
}

// Debt records own linked transactions, including their current status after corrections.
export function overviewPayments(
  bills: BillView[],
  debts: Debt[],
  payments: DebtPayment[],
  month: string,
  today = localBillDate(),
) {
  const records = new Map<string, OverviewPayment>()
  for (const payment of payments) {
    records.set(`debt:${payment.id}`, {
      id: payment.id,
      name: debts.find((debt) => debt.id === payment.debtId)?.creditorName ?? 'Debt payment',
      source: 'debt',
      date: payment.paymentDate,
      amountCents: payment.amountCents,
      status: payment.paymentStatus,
    })
  }
  for (const bill of bills)
    for (const payment of bill.payments) {
      if (payment.debtPaymentId) continue
      records.set(`bill:${payment.id}`, {
        id: payment.id,
        name: bill.name,
        source: 'bill',
        date: payment.paymentDate,
        amountCents: payment.amountCents,
        status: payment.status,
      })
    }
  const monthly = [...records.values()].filter((payment) => payment.date.startsWith(month))
  const group = (status: OverviewPayment['status']) => {
    const items = monthly
      .filter(
        (payment) => payment.status === status && (status !== 'completed' || payment.date <= today),
      )
      .sort((a, b) =>
        status === 'completed' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
      )
    return { items, totalCents: sumCents(items.map((payment) => payment.amountCents)) }
  }
  const periods = bills
    .filter((bill) => bill.status !== 'cancelled')
    .flatMap((bill) => bill.periods)
    .filter((period) => period.dueDate.startsWith(month) && period.paymentStatus !== 'cancelled')
  const confirmed = periods.filter((period) => typeof period.amountCents === 'number')
  const estimated = periods.filter(
    (period) => typeof (period.budgetEstimateCents ?? period.estimatedAmountCents) === 'number',
  )
  return {
    billAmounts: {
      periodCount: periods.length,
      estimatedCount: estimated.length,
      estimatedCents: sumCents(
        estimated.map((period) => (period.budgetEstimateCents ?? period.estimatedAmountCents)!),
      ),
      confirmedCount: confirmed.length,
      unconfirmedCount: periods.length - confirmed.length,
      confirmedCents: sumCents(confirmed.map((period) => period.amountCents!)),
      // Period views already reflect completed payments, including linked debt corrections.
      // Include payments on unconfirmed bills; they do not establish the amount owed.
      paidCents: sumCents(periods.map((period) => period.paidCents ?? 0)),
      remainingCents: sumCents(confirmed.map((period) => period.remainingCents ?? 0)),
      creditCents: sumCents(periods.map((period) => period.creditCents ?? 0)),
      overpaidCents: sumCents(periods.map((period) => period.overpaidCents ?? 0)),
    },
    billProgress: billProgress(periods),
    futureCompletedCount: monthly.filter(
      (payment) => payment.status === 'completed' && payment.date > today,
    ).length,
    completed: group('completed'),
    pending: group('pending'),
    scheduled: group('scheduled'),
    remainingBills: {
      amountCents: sumCents(periods.map((period) => period.remainingCents ?? 0)),
      unknownCount: periods.filter((period) => period.remainingCents === null).length,
    },
  }
}
