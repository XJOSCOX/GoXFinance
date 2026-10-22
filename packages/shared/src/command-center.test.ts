import { expect, it } from 'vitest'
import { commandCenterSummary } from './command-center-summary'
import { commandPreferencesSchema } from './command-center'
import { smartPlanner } from './planner-engine'
import { financialInsights } from './insight-engine'
import {
  insightFixture,
  insightInput,
  insightCategory,
  insightExpense,
  insightBudget,
} from './insights.fixture'
import { plannerFixture, fictionalBill, plannerRecord, proof } from './planner.fixture'
import { smartIncome, smartSource, smartWeek } from './smart-forecast.fixture'
import { payrollStatementSchema } from './payroll'
import { plannerInputSchema } from './planner'
import type { InsightSources, BankAccount } from './index'
const today = '2026-10-20',
  now = '2026-10-20T15:00:00Z'
export function commandFixture(s = insightFixture(), input = insightInput()) {
  const plan = smartPlanner(s, input, today),
    report = financialInsights(s, input, now, today, plan)
  return {
    s,
    input,
    plan,
    report,
    options: {
      home: 'fictional',
      today,
      now,
      month: '2026-10',
      owner: true,
      canManage: true,
      preferences: commandPreferencesSchema.parse({}),
      preferenceRevision: 0,
    },
  }
}
const summary = (f: ReturnType<typeof commandFixture>) =>
  commandCenterSummary(f.s, f.plan, f.report, f.input, f.options)
it('keeps missing cash and absent payroll unknown, with no writes or invented work periods', () => {
  const s = insightFixture(),
    input = insightInput()
  input.smart!.opening = null
  const f = commandFixture(s, input),
    before = JSON.stringify(f)
  const d = summary(f)
  expect(d.cash.amountCents).toBeNull()
  expect(d.paycheck).toBeNull()
  expect(d.projection.lowestCents).toBeNull()
  expect(d.actions.some((a) => a.id === 'confirm-cash')).toBe(true)
  expect(d.actions.some((a) => a.id.startsWith('upload:'))).toBe(false)
  expect(d.budget.allocationCents).toBeNull()
  expect(JSON.stringify(f)).toBe(before)
})
it('reconciles actual accounting, budgets and conditional payroll to authoritative modules', () => {
  const s = insightFixture(),
    c = insightCategory()
  s.categories = [c]
  s.expenses = [insightExpense(c.id, today, 1200)]
  s.budgets = [insightBudget(c.id, 10000)]
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek()]
  s.income.transactions = [
    smartIncome({
      status: 'confirmed',
      depositDate: today,
      actualNetCents: 70000,
      workPeriodStart: '2026-10-05',
      workPeriodEnd: '2026-10-11',
    }),
  ]
  const f = commandFixture(s),
    d = summary(f)
  expect(d.cash.amountCents).toBe(100000)
  expect(d.accounting.receivedCents).toBe(70000)
  expect(d.accounting.expectedCents).toBe(80000)
  expect(d.accounting).toMatchObject({
    cashPaidCents: 1200,
    spendingCents: 1200,
    netCashFlowCents: 68800,
  })
  expect(d.budget).toEqual({
    allocationCents: 10000,
    assignedCents: 10000,
    unallocatedCents: 0,
    actualCents: 1200,
  })
  expect(d.paycheck).toMatchObject({ status: 'estimated', netCents: 80000, date: '2026-10-23' })
  expect(d.projection.endingCents).toBe(f.plan.forecast.endingCents)
  f.options.month = '2026-09'
  expect(summary(f).accounting.receivedCents).toBe(0)
  expect(summary(f).paycheck).toEqual(d.paycheck)
})
it('moves a reviewed period to one documented paycheck, then one confirmed deposit; handles early and delayed dates', () => {
  const s = insightFixture()
  s.income.sources = [smartSource()]
  const w = smartWeek({
    incomeTransactionId: 'income',
    reviewedAt: now,
    statement: payrollStatementSchema.parse({
      netCents: 81000,
      grossCents: 100000,
      deductionsCents: 19000,
      lines: [],
      payDate: '2026-10-23',
      employer: 'Fictional employer',
      assignment: null,
      periodStart: '2026-10-12',
      periodEnd: '2026-10-18',
      acknowledgement: null,
    }),
  })
  s.payroll = [w]
  s.income.transactions = [smartIncome()]
  let d = summary(commandFixture(s))
  expect(d.paycheck?.status).toBe('reviewed')
  expect(d.accounting.expectedCents).toBe(81000)
  s.income.transactions[0] = {
    ...s.income.transactions[0],
    status: 'confirmed',
    depositDate: today,
    actualNetCents: 81000,
  }
  d = summary(commandFixture(s))
  expect(d.paycheck).toBeNull()
  expect(d.accounting.expectedCents).toBe(0)
  expect(d.accounting.receivedCents).toBe(81000)
  for (const date of ['2026-10-21', '2026-10-25']) {
    s.income.transactions = []
    s.payroll = [smartWeek({ expectedPayDate: date })]
    expect(summary(commandFixture(s)).paycheck?.date).toBe(date)
  }
})
it('requires fresh dated cash and detects changed selected account observations', () => {
  const f = commandFixture()
  f.options.now = '2026-10-22T15:00:00Z'
  let d = summary(f)
  expect(d.cash).toMatchObject({ amountCents: null, lastReportedCents: 100000, status: 'stale' })
  expect(d.timeline.every((day) => day.cashCents === null)).toBe(true)
  f.options.now = now
  f.input.smart!.opening!.source = 'selected_accounts'
  f.input.smart!.opening!.accounts = [
    { accountId: 'a', balanceId: 'v1', availableCents: 60000 },
    { accountId: 'b', balanceId: 'v2', availableCents: 40000 },
  ]
  f.s.cashAccounts = [
    {
      id: 'a',
      status: 'active',
      type: 'checking',
      currency: 'USD',
      balance: { id: 'v1', source: 'manual', observedAt: now, availableCents: 60000 },
    },
    {
      id: 'b',
      status: 'active',
      type: 'checking',
      currency: 'USD',
      balance: { id: 'v2', source: 'manual', observedAt: now, availableCents: 40000 },
    },
  ] as BankAccount[]
  expect(summary(f).cash.amountCents).toBe(100000)
  f.s.cashAccounts[1].balance!.observedAt = '2026-10-18T15:00:00Z'
  expect(summary(f).cash.amountCents).toBeNull()
  f.s.cashAccounts[1].balance!.observedAt = now
  f.s.cashAccounts[1].balance!.id = 'v3'
  d = summary(f)
  expect(d.cash.status).toBe('needs_confirmation')
  expect(d.cash.amountCents).toBeNull()
  const sources = insightFixture()
  sources.bills = [fictionalBill('Rent', 200000, '2026-10-21')]
  const stale = commandFixture(sources)
  stale.options.now = '2026-10-22T15:00:00Z'
  const risk = summary(stale).insights.find((i) => i.id.startsWith('essential-gap:'))!
  expect(risk).toMatchObject({ confidence: 'needs_confirmation', amountCents: null })
  expect(risk.explanation).toContain('Cash needs confirmation')
})
it('reuses split rent, linked debt, advance and reserve funding without duplicating outflows or overallocating payroll', () => {
  const { sources, input, rent } = plannerFixture(),
    s = { ...sources, balances: [] } as InsightSources
  s.debts.forEach((d) => {
    d.updatedAt = now
  })
  const f = commandFixture(s, input),
    d = summary(f)
  expect(d.obligations.some((o) => o.name === rent.name)).toBe(false)
  expect(d.obligations.filter((o) => /Fictional split rent/.test(o.name))).toHaveLength(2)
  expect(d.allocation.allocatedCents + d.allocation.remainingCents! + d.allocation.heldCents!).toBe(
    d.allocation.amountCents,
  )
  expect(d.allocation.allocatedCents).toBeLessThanOrEqual(80000)
  expect(d.obligations.filter((o) => /advance/i.test(o.name)).length).toBe(1)
  expect(d.obligations.reduce((n, o) => n + (o.remainingCents ?? 0), 0)).toBe(
    f.plan.items.reduce((n, o) => n + (o.amountCents ?? 0), 0),
  )
  expect(d.timeline.flatMap((day) => day.events).map((e) => e.id).length).toBe(
    new Set(d.timeline.flatMap((day) => day.events).map((e) => e.id)).size,
  )
})
it('keeps three verified critical obligations ahead of optional actions despite limited cash and handles overdue/unknown amounts', () => {
  const s = insightFixture()
  s.bills = [
    fictionalBill('Housing', 100000, '2026-10-19'),
    fictionalBill('Health', 50000, '2026-10-21'),
    fictionalBill('Support', 30000, '2026-10-22'),
    fictionalBill('Unknown essential', null, '2026-10-22'),
  ]
  s.planner!.records = s.bills.slice(0, 3).map((b) =>
    plannerRecord(
      plannerInputSchema.parse({
        kind: 'priority',
        name: b.name,
        target: { kind: 'bill', id: b.id },
        priority: 'critical',
        legalOrder: true,
        verification: proof,
      }),
    ),
  )
  const f = commandFixture(s),
    d = summary(f)
  expect(d.actions.slice(0, 3).every((a) => a.tier === 0)).toBe(true)
  expect(d.obligations.some((o) => o.date < '2026-10-20')).toBe(true)
  expect(d.obligations.some((o) => o.remainingCents === null)).toBe(true)
  expect(d.projection.incomplete).toBe(true)
})
import { profile } from './payroll.fixture'
import { commandActions } from './command-center-actions'
import { vi } from 'vitest'
import * as plannerModule from './planner-engine'
it('only prompts for a supported configured statement milestone and replaces prepare with upload', () => {
  const s = insightFixture()
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek()]
  const f = commandFixture(s),
    cash = summary(f).cash,
    paycheck = summary(f).paycheck
  expect(
    commandActions('home', s, f.plan, f.report, cash, paycheck, today, true, [
      {
        ...profile,
        id: 'profile',
        revision: 1,
        updatedAt: now,
        sourceId: 'source',
        milestonesConfigured: false,
      },
    ]).some((a) => a.id.startsWith('upload:')),
  ).toBe(false)
  const actions = commandActions('home', s, f.plan, f.report, cash, paycheck, '2026-10-22', true, [
    {
      ...profile,
      id: 'profile',
      revision: 1,
      updatedAt: now,
      sourceId: 'source',
      milestonesConfigured: true,
    },
  ])
  expect(actions.filter((a) => a.source.type === 'payroll')).toHaveLength(1)
  expect(actions.find((a) => a.id.startsWith('upload:'))?.destination).toContain(
    'action=upload&payroll=week',
  )
})
it('reuses the prepared Planner without a second timeline calculation and merges essential-gap actions using their actual due date', () => {
  const { sources, input } = plannerFixture()
  sources.debts.forEach((d) => {
    d.updatedAt = now
  })
  const s = { ...sources, balances: [] } as InsightSources,
    f = commandFixture(s, input)
  const spy = vi.spyOn(plannerModule, 'smartPlanner')
  try {
    financialInsights(s, input, now, today, f.plan)
    expect(spy).not.toHaveBeenCalled()
    const d = summary(f)
    expect(d.actions.filter((a) => a.id.startsWith('insight:essential-gap:'))).toHaveLength(0)
    expect(
      d.actions
        .filter((a) => a.id.startsWith('obligation:'))
        .every((a) => a.date! <= input.endDate),
    ).toBe(true)
  } finally {
    spy.mockRestore()
  }
})
it('retains unknown payroll subtotals without showing them as zero', () => {
  const s = insightFixture()
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek()]
  s.payroll[0].forecasts[0].result.netCents = null
  const d = summary(commandFixture(s))
  expect(d.paycheck?.netCents).toBeNull()
  expect(d.accounting.expectedCents).toBeNull()
  expect(d.accounting.expectedUnknownCount).toBe(1)
  expect(d.accounting.knownExpectedCents).toBe(0)
  expect(d.allocation.amountCents).toBeNull()
})
