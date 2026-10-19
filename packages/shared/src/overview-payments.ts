import type { BillView } from './bills'
import type { Debt } from './debts'
import type { DebtPayment } from './debt-payments'
import { sumCents } from './outflows'

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
      .filter((payment) => payment.status === status)
      .sort((a, b) =>
        status === 'completed' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
      )
    return { items, totalCents: sumCents(items.map((payment) => payment.amountCents)) }
  }
  const periods = bills
    .filter((bill) => bill.status !== 'cancelled')
    .flatMap((bill) => bill.periods)
    .filter((period) => period.dueDate.startsWith(month) && period.paymentStatus !== 'cancelled')
  return {
    completed: group('completed'),
    pending: group('pending'),
    scheduled: group('scheduled'),
    remainingBills: {
      amountCents: sumCents(periods.map((period) => period.remainingCents ?? 0)),
      unknownCount: periods.filter((period) => period.remainingCents === null).length,
    },
  }
}
