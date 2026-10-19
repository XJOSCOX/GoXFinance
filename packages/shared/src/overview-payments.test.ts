import { expect, it } from 'vitest'
import type { BillPayment, BillView } from './bills'
import type { DebtPayment } from './debt-payments'
import { billPeriodView } from './bill-calculations'
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
it('flags future completed records for review without counting them as cleared payments', () => {
  const result = overviewPayments(
    [bill([{ ...billPayment('future', 'completed'), paymentDate: '2026-10-30' }])],
    [],
    [],
    '2026-10',
    '2026-10-19',
  )
  expect(result.completed.totalCents).toBe(0)
  expect(result.futureCompletedCount).toBe(1)
})

it('separates period estimates, confirmed bills, actual payments, credits and unknown amounts', () => {
  const period = {
    id: 'utility',
    dueDate: '2026-10-10',
    amountCents: 34218,
    estimatedAmountCents: 30000,
    creditCents: 500,
  } as BillView['periods'][number]
  const actual = billPeriodView(
    period,
    [
      { ...billPayment('partial', 'completed'), periodId: period.id, amountCents: 20000 },
      { ...billPayment('pending', 'pending'), periodId: period.id, amountCents: 5000 },
      { ...billPayment('scheduled', 'scheduled'), periodId: period.id, amountCents: 5000 },
    ],
    false,
    '2026-10-19',
  )
  const unknown = billPeriodView(
    { ...period, id: 'unknown', amountCents: null, creditCents: 0 },
    [{ ...billPayment('unknown-paid', 'completed'), periodId: 'unknown', amountCents: 1000 }],
    false,
    '2026-10-19',
  )
  const overpaid = billPeriodView(
    { ...period, id: 'overpaid', amountCents: 1000, creditCents: 0 },
    [{ ...billPayment('overpaid', 'completed'), periodId: 'overpaid', amountCents: 1500 }],
    false,
    '2026-10-19',
  )
  const periods = [actual, unknown, overpaid]
  const result = overviewPayments(
    [
      bill([], [...periods, { ...actual, id: 'next-month', dueDate: '2026-11-01' }]),
      { ...bill([], [actual]), status: 'cancelled' },
    ],
    [],
    [],
    '2026-10',
    '2026-10-19',
  )
  expect(result.billAmounts).toEqual({
    periodCount: 3,
    estimatedCount: 3,
    estimatedCents: 90000,
    confirmedCount: 2,
    unconfirmedCount: 1,
    confirmedCents: 35218,
    paidCents: 22500,
    remainingCents: 13718,
    creditCents: 500,
    overpaidCents: 500,
  })
  expect(result.billProgress.paidCents).toBe(21000)
})
it('keeps linked bill payments once in both the bill view and payment activity', () => {
  const authoritative = debtPayment('linked', 'completed', 2000)
  const alias = { ...billPayment('alias', 'completed', 'linked'), periodId: 'period' }
  const period = billPeriodView(
    {
      id: 'period',
      dueDate: '2026-10-10',
      amountCents: 5000,
      estimatedAmountCents: 4000,
      creditCents: 0,
    } as BillView['periods'][number],
    [alias],
    false,
    '2026-10-19',
  )
  const result = overviewPayments(
    [bill([alias], [period])],
    [],
    [authoritative],
    '2026-10',
    '2026-10-19',
  )
  expect(result.billAmounts.paidCents).toBe(2000)
  expect(result.billAmounts.remainingCents).toBe(3000)
  expect(result.completed.totalCents).toBe(2000)
})
