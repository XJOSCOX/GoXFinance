import { it, expect } from 'vitest'
import { goalEndDate, goalWindows, goalProgress, type GoalSources } from './goal-calculations'
import type { GoalInput } from './goals'
import type { TradingResult, TradingAccount } from './trading'
import type { Expense } from './expenses'
import type { IncomeTransaction } from './income'
import type { DebtBalanceHistory } from './debt-payments'
import type { Debt } from './debts'
const base = {
  id: 'goal',
  timezone: 'America/Chicago',
  sessionStart: '18:00',
  name: 'Example',
  goalType: 'trading_profit',
  period: 'monthly',
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  targetCents: 15000,
  responsibleMemberId: null,
  tradingAccountId: null,
  copyGroupId: null,
  direction: 'at_least',
  status: 'active',
  notes: null,
} as GoalInput & { id: string }
const empty = (): GoalSources => ({
  accounts: [],
  results: [],
  events: [],
  groups: [],
  income: [],
  bills: [],
  expenses: [],
  debts: [],
  balances: [],
  contributions: [],
})
it('distinguishes a future goal from missing data and starts tracking on its first day', () => {
  const goal = {
    ...base,
    period: 'weekly' as const,
    startDate: '2026-10-25',
    endDate: '2026-10-31',
  }
  expect(goalProgress(goal, goal, empty(), '2026-10-19')).toMatchObject({
    notStarted: true,
    actualCents: null,
    met: null,
    shortfallCents: null,
  })
  expect(goalProgress(goal, goal, empty(), '2026-10-25')).toMatchObject({
    notStarted: false,
    actualCents: 0,
    met: false,
    shortfallCents: 15000,
  })
})
it('calculates anchored daily, weekly, monthly, quarterly and yearly periods without month-end drift', () => {
  expect(goalEndDate('2026-10-01', 'daily')).toBe('2026-10-01')
  expect(goalEndDate('2026-10-01', 'weekly')).toBe('2026-10-07')
  expect(goalEndDate('2026-01-31', 'monthly')).toBe('2026-02-27')
  expect(goalEndDate('2026-10-01', 'quarterly')).toBe('2026-12-31')
  expect(goalEndDate('2026-01-01', 'yearly')).toBe('2026-12-31')
  expect(goalWindows({ ...base, startDate: '2026-01-31' }, '2026-03-15')[0]).toEqual({
    startDate: '2026-02-28',
    endDate: '2026-03-30',
  })
  expect(goalWindows({ ...base, period: 'weekly' }, '2026-10-19')[0]).toEqual({
    startDate: '2026-10-15',
    endDate: '2026-10-21',
  })
})
it('retains negative trading performance, shortfalls and group source isolation', () => {
  const sources = empty()
  sources.results = [
    { accountId: 'a', sessionDate: '2026-10-10', netCents: -25000 },
  ] as TradingResult[]
  sources.accounts = [{ id: 'a', responsibleMemberId: 'member' }] as TradingAccount[]
  expect(goalProgress(base, base, sources, '2026-10-19')).toMatchObject({
    actualCents: -25000,
    shortfallCents: 40000,
    met: false,
  })
  expect(
    goalProgress(
      { ...base, goalType: 'trading_loss', direction: 'at_most', targetCents: 20000 },
      base,
      sources,
      '2026-10-19',
    ),
  ).toMatchObject({ actualCents: 25000, overageCents: 5000, met: false })
  expect(
    goalProgress({ ...base, copyGroupId: 'empty-group' }, base, sources, '2026-10-19').actualCents,
  ).toBe(0)
})
it('uses confirmed net deposits and purchase spending rather than expected income or repayments', () => {
  const sources = empty()
  sources.income = [
    { status: 'confirmed', depositDate: '2026-10-10', actualNetCents: 10000 },
    { status: 'pending', depositDate: '2026-10-10', actualNetCents: 50000 },
    { status: 'confirmed', depositDate: '2026-11-01', actualNetCents: 10000 },
  ] as IncomeTransaction[]
  expect(
    goalProgress({ ...base, goalType: 'confirmed_income' }, base, sources, '2026-10-19')
      .actualCents,
  ).toBe(10000)
  sources.expenses = [
    {
      id: 'e',
      voided: false,
      transactionDate: '2026-10-10',
      amountCents: 20000,
      paymentMethod: 'credit_card',
    },
  ] as Expense[]
  expect(
    goalProgress(
      { ...base, goalType: 'spending_limit', direction: 'at_most' },
      base,
      sources,
      '2026-10-19',
    ),
  ).toMatchObject({ actualCents: 20000, overageCents: 5000, met: false })
  expect(
    goalProgress({ ...base, goalType: 'savings' }, base, sources, '2026-10-19').actualCents,
  ).toBe(0)
})
it('requires verified debt balance observations and shows missing coverage instead of treating payments as reduction', () => {
  const sources = empty()
  sources.debts = [
    {
      id: 'd',
      householdId: 'h',
      confidence: 'confirmed',
      isArchived: false,
      currentBalanceCents: 90000,
      memberAssignments: [],
    },
  ] as unknown as Debt[]
  expect(
    goalProgress({ ...base, goalType: 'debt_reduction' }, base, sources, '2026-10-19'),
  ).toMatchObject({ actualCents: null, incomplete: true })
  sources.balances = [
    {
      id: '1',
      debtId: 'd',
      householdId: 'h',
      effectiveDate: '2026-10-01',
      createdAt: '1',
      source: 'creditor_statement',
      balanceCents: 100000,
    },
    {
      id: '2',
      debtId: 'd',
      householdId: 'h',
      effectiveDate: '2026-10-10',
      createdAt: '2',
      source: 'reconciliation',
      balanceCents: 110000,
    },
  ] as DebtBalanceHistory[]
  expect(
    goalProgress({ ...base, goalType: 'debt_reduction' }, base, sources, '2026-10-19'),
  ).toMatchObject({ actualCents: -10000, shortfallCents: 25000, incomplete: false })
})
