import { expect, it } from 'vitest'
import { forecast } from './forecast-calculations'
import { forecastInputSchema, type ForecastInput, type ForecastSources } from './forecasts'
import type { BillView } from './bills'
import type { Debt } from './debts'
const empty = (): ForecastSources => ({
  bills: [],
  debts: [],
  payments: [],
  income: { sources: [], transactions: [], canCreate: true },
  expenses: [],
  categories: [],
  offers: [],
})
const input: ForecastInput = {
  name: 'Fictional cash forecast',
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  startingCents: null,
  confidence: 'unverified',
  mode: 'expected',
  income: [],
  variableSpendingCents: 0,
  extraDebtCents: 0,
  includeSettlements: false,
  includeUncertainPayouts: false,
  oneTime: [],
}
const bill = {
  id: 'bill',
  name: 'Fictional utility',
  status: 'active',
  memberIds: [],
  categoryId: 'utility',
  kind: 'recurring',
  amountType: 'variable',
  amountCents: null,
  estimatedAmountCents: 30000,
  nextDueDate: '2026-11-10',
  frequency: 'monthly',
  endDate: null,
  linkedDebtId: null,
  periods: [],
  payments: [],
} as unknown as BillView
it('keeps opening cash unknown, computes daily exact-cent allowances and detects explicit cash shortfalls', () => {
  const r = forecast(empty(), { ...input, variableSpendingCents: 100 }, '2026-10-20')
  expect(r).toMatchObject({
    netChangeCents: -100,
    endingCents: null,
    lowestCents: null,
    spendingCents: 100,
  })
  expect(
    r.days.reduce(
      (n, d) =>
        n + r.events.filter((e) => e.date === d.date).reduce((n, e) => n + (e.amountCents ?? 0), 0),
      0,
    ),
  ).toBe(100)
  expect(
    forecast(empty(), { ...input, startingCents: 50, variableSpendingCents: 100 }, '2026-10-20')
      .endingCents,
  ).toBe(-50)
  expect(
    forecast(
      empty(),
      { ...input, startingCents: 0, extraDebtCents: 1 },
      '2026-10-20',
    ).shortfalls.at(-1)?.amountCents,
  ).toBe(1)
})
it('uses explicit net paycheck scenarios and preserves hourly gross separately; excludes trading P&L and uncertain payouts by default', () => {
  const s = empty()
  s.income.sources = [
    {
      id: 'source',
      name: 'Fictional hourly',
      incomeType: 'hourly',
      status: 'active',
      isArchived: false,
      frequency: 'weekly',
      hourlyRateCents: 2500,
      overtimeMultiplier: '1.5',
    } as never,
  ]
  const v = {
    ...input,
    income: [
      {
        sourceId: 'source',
        firstPayDate: '2026-11-05',
        conservativeNetCents: 50000,
        expectedNetCents: 65000,
        optimisticNetCents: 80000,
        regularHours: '30',
        overtimeHours: '2',
      },
    ],
    oneTime: [
      {
        id: 'payout',
        date: '2026-11-05',
        name: 'Uncertain payout',
        amountCents: 100000,
        kind: 'uncertain_payout' as const,
      },
    ],
  }
  const r = forecast(s, v, '2026-10-20')
  expect(r.incomeCents).toBe(260000)
  expect(r.events[0].grossCents).toBe(82500)
  expect(forecast(s, { ...v, mode: 'conservative' }, '2026-10-20').incomeCents).toBe(200000)
  expect(forecast(s, { ...v, includeUncertainPayouts: true }, '2026-10-20').incomeCents).toBe(
    360000,
  )
  s.income.sources[0].incomeType = 'trading_payout'
  expect(forecast(s, v, '2026-10-20').incomeCents).toBe(0)
})
it('deduplicates debt-linked bills, scheduled debt payments and aliases without creating transactions', () => {
  const s = empty()
  s.debts = [
    {
      id: 'debt',
      householdId: 'home',
      isArchived: false,
      currentBalanceCents: 100000,
      minimumPaymentCents: 66500,
      dueDay: 10,
      nextDueDate: null,
      memberAssignments: [],
      confidence: 'unverified',
      creditorName: 'Fictional loan',
    } as unknown as Debt,
  ]
  s.payments = [
    {
      id: 'pay',
      debtId: 'debt',
      paymentStatus: 'scheduled',
      paymentDate: '2026-11-10',
      paymentMethod: 'cash',
      amountCents: 30000,
    } as never,
  ]
  s.bills = [
    {
      ...bill,
      linkedDebtId: 'debt',
      amountType: 'fixed',
      amountCents: 66500,
      estimatedAmountCents: null,
      payments: [
        {
          id: 'alias',
          debtId: 'debt',
          debtPaymentId: 'pay',
          amountCents: 30000,
          status: 'scheduled',
          paymentDate: '2026-11-10',
        } as never,
      ],
    },
  ]
  const r = forecast(s, input, '2026-10-20')
  expect(r.outflowCents).toBe(66500)
  expect(r.events.filter((e) => e.kind === 'scheduled')).toHaveLength(1)
  expect(s.payments).toHaveLength(1)
  expect(s.debts[0].currentBalanceCents).toBe(100000)
})
it('keeps actual bill amounts and partial payments separate from estimates', () => {
  const s = empty()
  s.bills = [
    {
      ...bill,
      periods: [
        {
          id: 'period',
          name: 'Fictional utility',
          dueDate: '2026-11-10',
          amountCents: 34218,
          estimatedAmountCents: 30000,
          paidCents: 20000,
          creditCents: 0,
          remainingCents: 14218,
          paymentStatus: 'partially_paid',
          linkedDebtId: null,
        } as never,
      ],
      payments: [
        {
          id: 'paid',
          periodId: 'period',
          billId: 'bill',
          amountCents: 20000,
          status: 'completed',
          paymentDate: '2026-11-05',
          method: 'cash',
          debtPaymentId: null,
        } as never,
      ],
    },
  ]
  const r = forecast(s, input, '2026-11-07')
  expect(r.outflowCents).toBe(34218)
  expect(r.events.find((e) => e.id.startsWith('obligation:'))?.amountCents).toBe(14218)
  s.bills[0].periods[0].amountCents = null
  s.bills[0].estimatedAmountCents = null
  s.bills[0].periods[0].estimatedAmountCents = null
  expect(forecast(s, { ...input, startingCents: 100000 }, '2026-11-07')).toMatchObject({
    incomplete: true,
    endingCents: null,
  })
})
it('separates credit-card purchase spending from cash and counts confirmed income once', () => {
  const s = empty()
  s.expenses = [
    {
      id: 'purchase',
      description: 'Fictional groceries',
      amountCents: 10000,
      transactionDate: '2026-11-05',
      paymentMethod: 'credit_card',
      voided: false,
    } as never,
  ]
  s.income.transactions = [
    {
      id: 'deposit',
      sourceId: 'source',
      status: 'confirmed',
      actualNetCents: 12345,
      depositDate: '2026-11-05',
      actualGrossCents: 15000,
    } as never,
  ]
  const r = forecast(s, { ...input, startingCents: 0 }, '2026-11-07')
  expect(r).toMatchObject({
    incomeCents: 12345,
    outflowCents: 0,
    spendingCents: 10000,
    endingCents: 12345,
  })
})
it('validates date ranges and source assumptions and offsets optional settlement schedules once', () => {
  expect(forecastInputSchema.safeParse({ ...input, endDate: '2025-01-01' }).success).toBe(false)
  const s = empty()
  s.offers = [
    {
      id: 'o',
      status: 'accepted',
      debtId: 'd',
      creditor: 'Fictional',
      schedule: [{ id: 'i', dueDate: '2026-11-10', amountCents: 10000, paymentId: null }],
    } as never,
  ]
  expect(forecast(s, input, '2026-10-20').outflowCents).toBe(0)
  expect(forecast(s, { ...input, includeSettlements: true }, '2026-10-20').outflowCents).toBe(10000)
})
