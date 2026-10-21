import { expect, it } from 'vitest'
import type { BillView } from './bills'
import type { Debt } from './debts'
import { forecast } from './forecast-calculations'
import { smartSources, smartInput } from './smart-forecast.fixture'

const bill = (): BillView =>
  ({
    id: 'bill',
    name: 'Fictional utility',
    status: 'active',
    memberIds: [],
    kind: 'one_time',
    amountType: 'variable',
    amountCents: null,
    estimatedAmountCents: 30000,
    nextDueDate: '2026-10-22',
    frequency: null,
    endDate: null,
    linkedDebtId: null,
    payments: [],
    periods: [
      {
        id: 'period',
        name: 'Fictional utility',
        dueDate: '2026-10-22',
        amountCents: 34218,
        budgetEstimateCents: 30000,
        estimatedAmountCents: 30000,
        creditCents: 0,
        paidCents: 0,
        linkedDebtId: null,
        paymentStatus: 'unpaid',
      },
    ],
  }) as unknown as BillView
const debt = (): Debt =>
  ({
    id: 'debt',
    householdId: 'home',
    isArchived: false,
    currentBalanceCents: 100000,
    minimumPaymentCents: 10000,
    pastDueAmountCents: null,
    dueDay: 22,
    nextDueDate: '2026-10-22',
    memberAssignments: [],
    creditorName: 'Fictional debt',
    confidence: 'unverified',
  }) as unknown as Debt

it('uses confirmed variable bill amounts, counts partial scheduled payments once and detects unknown bills', () => {
  const s = smartSources()
  s.bills = [bill()]
  s.bills[0].payments = [
    {
      id: 'pay',
      periodId: 'period',
      amountCents: 20000,
      status: 'scheduled',
      paymentDate: '2026-10-21',
      method: 'cash',
      debtPaymentId: null,
    } as never,
  ]
  const r = forecast(s, smartInput(), '2026-10-20')
  expect(r.outflowCents).toBe(34218)
  expect(r.events.find((e) => e.kind === 'bill')?.amountCents).toBe(14218)
  expect(r.events.find((e) => e.kind === 'scheduled')?.amountCents).toBe(20000)
  s.bills[0].periods[0].amountCents = null
  s.bills[0].periods[0].budgetEstimateCents = null
  s.bills[0].periods[0].estimatedAmountCents = null
  s.bills[0].estimatedAmountCents = null
  expect(forecast(s, smartInput(), '2026-10-20').endingCents).toBeNull()
})
it('counts linked debt and bill payment aliases once and offsets the remaining obligation', () => {
  const s = smartSources()
  s.debts = [debt()]
  s.bills = [
    {
      ...bill(),
      linkedDebtId: 'debt',
      amountType: 'fixed',
      amountCents: 10000,
      periods: [{ ...bill().periods[0], amountCents: 10000, linkedDebtId: 'debt' }],
    },
  ]
  s.payments = [
    {
      id: 'pay',
      debtId: 'debt',
      paymentStatus: 'scheduled',
      paymentDate: '2026-10-22',
      amountCents: 5000,
      paymentMethod: 'cash',
    } as never,
  ]
  s.bills[0].payments = [
    {
      id: 'alias',
      periodId: 'period',
      debtPaymentId: 'pay',
      status: 'scheduled',
      paymentDate: '2026-10-22',
      amountCents: 5000,
      method: 'cash',
    } as never,
  ]
  const r = forecast(s, smartInput(), '2026-10-20')
  expect(r.outflowCents).toBe(10000)
  expect(r.events).toHaveLength(2)
  expect(r.events.map((e) => e.amountCents).sort()).toEqual([5000, 5000])
})
it('does not deduct old completed expenses or credit purchases from current opening cash', () => {
  const s = smartSources()
  s.expenses = [
    {
      id: 'old',
      description: 'Old cash expense',
      voided: false,
      transactionDate: '2026-09-01',
      amountCents: 50000,
      paymentMethod: 'cash',
    },
    {
      id: 'credit',
      description: 'Card purchase',
      voided: false,
      transactionDate: '2026-10-20',
      amountCents: 15000,
      paymentMethod: 'credit_card',
    },
  ] as never
  s.payments = [
    {
      id: 'repay',
      debtId: 'debt',
      paymentStatus: 'completed',
      paymentDate: '2026-10-20',
      amountCents: 10000,
      paymentMethod: 'cash',
    } as never,
  ]
  const v = smartInput()
  v.smart!.opening!.includedActivityIds = ['actual:repay']
  const r = forecast(s, v, '2026-10-20')
  expect(r.outflowCents).toBe(0)
  expect(r.endingCents).toBe(100000)
  expect(r.spendingCents).toBe(15000)
})
it('retains early scheduled bill payments even when their due date is outside the horizon', () => {
  const s = smartSources()
  s.bills = [
    {
      ...bill(),
      nextDueDate: '2026-12-01',
      periods: [],
      payments: [
        {
          id: 'early',
          periodId: 'future',
          debtPaymentId: null,
          status: 'scheduled',
          paymentDate: '2026-10-22',
          amountCents: 20000,
          method: 'cash',
        } as never,
      ],
    },
  ]
  expect(forecast(s, smartInput(), '2026-10-20').outflowCents).toBe(20000)
})
it('carries overdue pending payments and bills forward without counting them as cleared cash', () => {
  const s = smartSources()
  s.bills = [
    {
      ...bill(),
      nextDueDate: '2026-10-19',
      periods: [{ ...bill().periods[0], dueDate: '2026-10-19' }],
      payments: [
        {
          id: 'late',
          periodId: 'period',
          debtPaymentId: null,
          status: 'pending',
          paymentDate: '2026-10-19',
          amountCents: 10000,
          method: 'cash',
        } as never,
      ],
    },
  ]
  const r = forecast(s, smartInput(), '2026-10-20')
  expect(r.outflowCents).toBe(34218)
  expect(r.events.find((e) => e.id === 'planned-bill:late')).toMatchObject({
    date: '2026-10-20',
    originalDate: '2026-10-19',
    estimated: true,
  })
  expect(r.incomplete).toBe(true)
})
it('allows optional payment postponement while preserving the actual payment date and monthly coverage', () => {
  const s = smartSources()
  s.debts = [debt()]
  s.payments = [
    {
      id: 'optional',
      debtId: 'debt',
      paymentStatus: 'scheduled',
      paymentDate: '2026-10-22',
      amountCents: 10000,
      paymentMethod: 'cash',
    } as never,
  ]
  const v = smartInput()
  v.smart!.postponedPayments = [{ eventId: 'planned-debt:optional', delayDays: 5 }]
  const r = forecast(s, v, '2026-10-20')
  expect(r.events).toHaveLength(1)
  expect(r.events[0]).toMatchObject({
    date: '2026-10-27',
    originalDate: '2026-10-22',
    amountCents: 10000,
  })
  expect(s.payments[0].paymentDate).toBe('2026-10-22')
})
it('includes accepted settlement schedules only when enabled and offsets the linked debt minimum', () => {
  const s = smartSources()
  s.debts = [debt()]
  s.offers = [
    {
      id: 'offer',
      debtId: 'debt',
      status: 'accepted',
      creditor: 'Fictional settlement',
      schedule: [{ id: 'installment', dueDate: '2026-10-22', amountCents: 15000, paymentId: null }],
    } as never,
  ]
  const v = smartInput()
  expect(forecast(s, v, '2026-10-20').outflowCents).toBe(10000)
  v.includeSettlements = true
  expect(forecast(s, v, '2026-10-20').outflowCents).toBe(15000)
})
