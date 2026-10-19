import { expect, it } from 'vitest'
import type { BillPayment, BillView } from './bills'
import type { DebtPayment } from './debt-payments'
import { overviewPayments } from './overview-payments'

const debtPayment = (
  id: string,
  status: DebtPayment['paymentStatus'],
  amountCents = 1000,
): DebtPayment =>
  ({
    id,
    debtId: 'debt',
    paymentStatus: status,
    amountCents,
    paymentDate: '2026-10-10',
  }) as DebtPayment
const billPayment = (
  id: string,
  status: BillPayment['status'],
  debtPaymentId: string | null = null,
): BillPayment =>
  ({
    id,
    status,
    amountCents: 2000,
    paymentDate: '2026-10-11',
    debtPaymentId,
  }) as BillPayment
const bill = (payments: BillPayment[] = [], periods: BillView['periods'] = []): BillView =>
  ({
    id: 'bill',
    name: 'Electricity',
    status: 'active',
    payments,
    periods,
  }) as BillView

it('keeps scheduled, pending and completed payments separate, excludes other statuses and reporting months', () => {
  const result = overviewPayments(
    [
      bill([
        billPayment('bill-completed', 'completed'),
        billPayment('bill-pending', 'pending'),
        billPayment('bill-scheduled', 'scheduled'),
        billPayment('failed', 'failed'),
        billPayment('cancelled', 'cancelled'),
      ]),
    ],
    [],
    [
      debtPayment('completed', 'completed'),
      debtPayment('pending', 'pending'),
      debtPayment('scheduled', 'scheduled'),
      { ...debtPayment('old', 'completed'), paymentDate: '2026-09-30' },
    ],
    '2026-10',
  )
  for (const group of [result.completed, result.pending, result.scheduled]) {
    expect(group.items).toHaveLength(2)
    expect(group.totalCents).toBe(3000)
  }
})

it('counts linked records once and follows authoritative corrections and cancellations', () => {
  const bills = [bill([billPayment('alias', 'completed', 'authoritative')])]
  const payment = debtPayment('authoritative', 'completed', 1500)
  expect(overviewPayments(bills, [], [payment, payment], '2026-10').completed.totalCents).toBe(1500)
  const changed = overviewPayments(bills, [], [{ ...payment, paymentStatus: 'pending' }], '2026-10')
  expect(changed.completed.totalCents).toBe(0)
  expect(changed.pending.totalCents).toBe(1500)
  expect(
    overviewPayments(bills, [], [{ ...payment, paymentStatus: 'cancelled' }], '2026-10').completed
      .items,
  ).toEqual([])
})

it('totals actual period remainders, preserving unknowns, credits, overpayments and month boundaries', () => {
  const period = {
    dueDate: '2026-10-01',
    remainingCents: 14218,
    paymentStatus: 'partially_paid',
  } as BillView['periods'][number]
  const result = overviewPayments(
    [
      bill(
        [],
        [
          period,
          { ...period, remainingCents: null },
          { ...period, remainingCents: 0, paymentStatus: 'overpaid' },
          { ...period, remainingCents: 0, paymentStatus: 'credited' },
          { ...period, dueDate: '2026-11-01', remainingCents: 9999 },
        ],
      ),
      { ...bill([], [period]), status: 'cancelled' },
    ],
    [],
    [],
    '2026-10',
  )
  expect(result.remainingBills).toEqual({ amountCents: 14218, unknownCount: 1 })
})
