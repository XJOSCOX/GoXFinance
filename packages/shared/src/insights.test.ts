import { expect, it } from 'vitest'
import { financialInsights } from './insight-engine'
import { spendingEvidence } from './insight-spending'
import { insightPeriods, roundedRatio } from './insight-statistics'
import {
  insightFixture,
  insightInput,
  insightCategory,
  insightExpense,
  insightBudget,
  insightBalance,
} from './insights.fixture'
import {
  fictionalDebt,
  fictionalBill,
  fictionalAdvance,
  plannerRecord,
  proof,
} from './planner.fixture'
import { smartIncome, smartSource } from './smart-forecast.fixture'
import type { FinancialRefund, BankAccount } from './index'
const now = '2026-10-20T12:00:00Z'
it('leaves absent income, spending, savings, coverage and opening cash unknown; never fabricates a score', () => {
  const s = insightFixture(),
    input = insightInput()
  input.smart!.opening = null
  const r = financialInsights(s, input, now)
  expect(r.status).toBe('needs_information')
  expect(r.metrics.every((m) => m.value === null)).toBe(true)
  expect(r).not.toHaveProperty('score')
})
it('compares equal partial-month windows and rounds ratios exactly without floating-point cents', () => {
  expect(insightPeriods('2026-03-31')).toEqual({
    from: '2026-03-01',
    through: '2026-03-28',
    comparisonFrom: '2026-02-01',
    comparisonThrough: '2026-02-28',
  })
  expect(roundedRatio(1, 3, 10000)).toBe(3333)
  expect(roundedRatio(-1, 8, 100)).toBe(-13)
  expect(roundedRatio(1, 0)).toBeNull()
  expect(roundedRatio(Number.MAX_SAFE_INTEGER, 1, 10000)).toBeNull()
  const s = insightFixture(),
    c = insightCategory()
  s.categories = [c]
  s.expenses = [
    insightExpense(c.id, '2026-09-01', 1000),
    insightExpense(c.id, '2026-09-15', 1000),
    insightExpense(c.id, '2026-09-29', 999999),
    insightExpense(c.id, '2026-10-01', 1500),
    insightExpense(c.id, '2026-10-15', 1500),
  ]
  const trend = financialInsights(s, insightInput(), now).insights.find(
    (i) => i.type === 'category_trend',
  )!
  expect(trend).toMatchObject({
    currentCents: 3000,
    comparisonCents: 2000,
    changeBps: 5000,
    sampleCount: 4,
  })
  s.expenses[3].amountCents = 500
  s.expenses[3].allocations[0].amountCents = 500
  s.expenses[4].amountCents = 500
  s.expenses[4].allocations[0].amountCents = 500
  expect(
    financialInsights(s, insightInput(), now).insights.find((i) => i.type === 'category_trend'),
  ).toMatchObject({ changeBps: -5000 })
})
it('nets refunds, counts card purchases once, excludes linked debt repayments and respects arbitrary action start dates', () => {
  const s = insightFixture(),
    c = insightCategory(),
    bill = fictionalBill('Card repayment', 10000, '2026-10-10')
  s.categories = [c]
  s.bills = [bill]
  bill.linkedDebtId = 'debt'
  bill.periods[0].linkedDebtId = 'debt'
  bill.payments = [
    {
      id: 'p',
      periodId: bill.periods[0].id,
      billId: bill.id,
      paymentDate: '2026-10-10',
      amountCents: 10000,
      status: 'completed',
      debtPaymentId: 'dp',
    } as (typeof bill.payments)[number],
  ]
  s.expenses = [
    {
      ...insightExpense(c.id, '2026-10-10', 10000),
      paymentMethod: 'credit_card',
      linkedDebtId: 'debt',
    },
    insightExpense(c.id, '2026-10-01', 9000),
  ]
  s.refunds = [
    {
      id: 'refund',
      date: '2026-10-11',
      amountCents: 2000,
      status: 'completed',
      debtPaymentId: null,
      expenseId: null,
      billPaymentId: null,
      method: 'cash',
      memberIds: [],
      allocations: [{ categoryId: c.id, amountCents: 2000 }],
    } as FinancialRefund,
  ]
  expect(spendingEvidence(s, '2026-10-05', '2026-10-20', c.id)).toMatchObject({
    cents: 8000,
    count: 2,
  })
  expect(
    spendingEvidence(s, '2026-10-05', '2026-10-20', c.id).refs.some((r) => r.type === 'refund'),
  ).toBe(true)
})
it('requires distinct recurring dates; links existing bills; recognizes weekly, annual and price patterns without creating records', () => {
  for (const dates of [
    ['2026-10-01', '2026-10-08', '2026-10-15'],
    ['2024-10-21', '2025-10-21', '2026-10-20'],
  ]) {
    const s = insightFixture(),
      c = insightCategory()
    s.categories = [c]
    s.expenses = dates.map((d, i) => insightExpense(c.id, d, 1500 + i * 200, 'Example service'))
    const bill = fictionalBill('Example service', 1900, '2026-10-21')
    s.bills = [bill]
    const before = JSON.stringify(s),
      r = financialInsights(s, insightInput(), now)
    expect(r.insights.find((i) => i.type === 'recurring')).toMatchObject({
      module: 'bills',
      sampleCount: 3,
    })
    expect(r.insights.some((i) => i.type === 'price_increase')).toBe(true)
    expect(JSON.stringify(s)).toBe(before)
  }
  const s = insightFixture(),
    c = insightCategory()
  s.expenses = [1, 2, 3].map(() => insightExpense(c.id, '2026-10-15', 1500, 'Duplicate service'))
  const r = financialInsights(s, insightInput(), now)
  expect(r.insights.some((i) => i.type === 'duplicate_review')).toBe(true)
  expect(r.insights.some((i) => i.type === 'recurring')).toBe(false)
})
it('does not offer an unspent allowance from missing spending, flags budget overspend and merchant outliers', () => {
  const s = insightFixture(),
    c = insightCategory()
  s.categories = [c]
  s.budgets = [insightBudget(c.id, 10000)]
  expect(
    financialInsights(s, insightInput(), now).insights.some((i) => i.type === 'budget_review'),
  ).toBe(false)
  s.expenses = [1, 2, 3, 4, 5].map((n) => insightExpense(c.id, `2026-10-0${n}`, 1000))
  s.expenses.push(insightExpense(c.id, '2026-10-15', 10000))
  const r = financialInsights(s, insightInput(), now)
  expect(r.insights.some((i) => i.type === 'budget_over')).toBe(true)
  expect(r.insights.some((i) => i.type === 'spending_spike')).toBe(true)
})
it('separates employer samples and actual income from expected wages, borrowed cash and simulated trading', () => {
  const s = insightFixture()
  s.income.sources = [
    smartSource(),
    { ...smartSource(), id: 'military', name: 'Fictional military' },
  ]
  s.income.transactions = [
    ...['2026-10-02', '2026-10-09', '2026-10-16', '2026-09-25'].map((d, i) =>
      smartIncome({
        id: 'pay' + i,
        status: 'confirmed',
        actualNetCents: 10000,
        depositDate: d,
        payDate: d,
        frequencySnapshot: 'weekly',
        workPeriodStart: null,
        workPeriodEnd: null,
      }),
    ),
    smartIncome({ id: 'expected', status: 'expected', expectedNetCents: 99999999 }),
    smartIncome({
      id: 'mil',
      sourceId: 'military',
      status: 'confirmed',
      actualNetCents: 20000,
      depositDate: '2026-10-15',
    }),
  ]
  const r = financialInsights(s, insightInput(), now)
  expect(r.metrics.find((m) => m.key === 'confirmed_income')?.value).toBe(50000)
  expect(r.insights.some((i) => i.type === 'income_variability')).toBe(false) // work-period coverage is required
  s.income.transactions
    .filter((t) => t.sourceId === 'source')
    .forEach((t, i) => {
      t.workPeriodStart = `2026-09-${String(1 + i * 7).padStart(2, '0')}`
      t.workPeriodEnd = `2026-09-${String(7 + i * 7).padStart(2, '0')}`
    })
  expect(
    financialInsights(s, insightInput(), now).insights.find((i) => i.type === 'income_variability'),
  ).toMatchObject({ currentCents: 10000, sampleCount: 4 })
})
it('uses only verified balance observations, never assumes principal from payments or unknown APR, preserves essential priorities', () => {
  const s = insightFixture(),
    d = fictionalDebt()
  d.householdId = 'home'
  d.updatedAt = now
  s.debts = [d]
  s.balances = [
    insightBalance(d.id, '2026-09-01', 50000),
    { ...insightBalance(d.id, '2026-10-01', 40000), source: 'manual_adjustment' },
  ]
  s.payments = ['2026-10-05', '2026-10-10'].map((paymentDate, n) => ({
    id: `fictional-payment-${n}`,
    debtId: d.id,
    amountCents: 20000,
    paymentDate,
    paymentStatus: 'completed',
    paymentMethod: 'cash',
    principalAmountCents: null,
    interestAmountCents: null,
    feesAmountCents: null,
  })) as never
  expect(
    financialInsights(s, insightInput(), now).insights.some(
      (i) => i.type === 'verified_debt_trend',
    ),
  ).toBe(false)
  expect(d.currentBalanceCents).toBe(50000)
  s.balances.push(insightBalance(d.id, '2026-10-10', 55000))
  d.interestRateApr = '25'
  d.confidence = 'confirmed'
  d.balanceVerifiedAt = now
  d.creditLimitCents = 100000
  const r = financialInsights(s, insightInput(), now)
  expect(r.insights.find((i) => i.type === 'verified_debt_trend')).toMatchObject({
    currentCents: 55000,
    comparisonCents: 50000,
    priority: 'important',
  })
  expect(r.insights.some((i) => i.type === 'apr_pressure')).toBe(true)
  expect(r.insights.some((i) => i.type === 'credit_utilization')).toBe(true)
})
it('derives funding/buffer risk and disclosed split/advance fees without double-counting the original bill', () => {
  const s = insightFixture(),
    bill = fictionalBill('Rent', 120000, '2026-10-21')
  s.bills = [bill]
  const d = fictionalDebt()
  d.updatedAt = now
  s.debts = [d]
  s.planner!.records = [
    plannerRecord({
      kind: 'priority',
      name: 'Housing priority',
      notes: '',
      target: { kind: 'bill', id: bill.id, parentId: null },
      priority: 'essential',
      essential: true,
      legalOrder: false,
      consequence: 'none',
      deadline: null,
      graceDays: null,
      lateFeeCents: null,
      partialAllowed: 'unknown',
      verification: proof,
      paymentAccountId: null,
    }),
    plannerRecord(fictionalAdvance(d.id)),
    plannerRecord({
      kind: 'arrangement',
      name: 'Rent split',
      notes: '',
      target: { kind: 'bill', id: bill.id, parentId: null },
      arrangementType: 'split',
      provider: 'Fictional provider',
      originalCents: 120000,
      financedCents: 120000,
      downPaymentCents: 0,
      expenseId: null,
      status: 'active',
      verification: proof,
      replacesOriginal: true,
      coverageStart: '2026-10-01',
      coverageEnd: '2026-10-31',
      installments: [
        {
          id: 'first',
          date: '2026-10-21',
          principalCents: 60000,
          feesCents: 1000,
          interestCents: 0,
          payments: [],
        },
        {
          id: 'last',
          date: '2026-10-28',
          principalCents: 60000,
          feesCents: 1000,
          interestCents: 0,
          payments: [],
        },
      ],
    }),
  ]
  const input = insightInput()
  input.smart!.bufferCents = 50000
  const r = financialInsights(s, input, now)
  expect(r.insights.find((i) => i.type === 'split_cost')?.currentCents).toBe(2000)
  expect(r.insights.find((i) => i.type === 'advance_pressure')).toMatchObject({
    currentCents: 12000,
    comparisonCents: 2000,
  })
  expect(r.insights.some((i) => i.type.startsWith('cash_') || i.type === 'essential_gap')).toBe(
    true,
  )
  const priorities = r.insights.map((i) =>
    ['urgent', 'important', 'improvement', 'informational'].indexOf(i.priority),
  )
  expect(priorities).toEqual([...priorities].sort((a, b) => a - b))
})
it('does not aggregate overlapping savings observations or label manual goals as achieved savings', () => {
  const s = insightFixture()
  s.cashAccounts = [
    {
      id: 'a',
      status: 'active',
      type: 'savings',
      currency: 'USD',
      balance: { id: 'b', observedAt: now, availableCents: 100000 },
    } as BankAccount,
    {
      id: 'a2',
      status: 'active',
      type: 'savings',
      currency: 'USD',
      balance: { id: 'b2', observedAt: now, availableCents: 100000 },
    } as BankAccount,
  ]
  const r = financialInsights(s, insightInput(), now)
  expect(r.metrics.find((m) => m.key === 'emergency_coverage')?.value).toBeNull()
  expect(r.metrics.find((m) => m.key === 'savings_progress')?.value).toBeNull()
})
it('groups repeated projected negative days into one insight and retains accurate evaluation time across local midnight', () => {
  const s = insightFixture()
  s.bills = [fictionalBill('Essential rent', 120000, '2026-10-21')]
  const r = financialInsights(s, insightInput(), '2026-10-21T01:00:00Z', '2026-10-20')
  expect(r.evaluatedAt).toBe('2026-10-21T01:00:00Z')
  expect(r.through).toBe('2026-10-20')
  const shortages = r.insights.filter((i) => i.type === 'cash_negative')
  expect(shortages).toHaveLength(1)
  expect(shortages[0].sampleCount).toBeGreaterThan(1)
})
it('shows complete known bases without converting unknown minimums to zero, and uses one dated savings observation', () => {
  const s = insightFixture(),
    housing = insightCategory('Housing'),
    bill = fictionalBill('Home', 30000, '2026-10-21'),
    d = fictionalDebt('Card', 5000)
  d.updatedAt = now
  bill.categoryId = housing.id
  bill.periods[0].categoryId = housing.id
  s.categories = [housing]
  s.bills = [bill]
  s.debts = [d]
  s.income.transactions = [
    smartIncome({ status: 'confirmed', actualNetCents: 100000, depositDate: '2026-10-15' }),
  ]
  s.cashAccounts = [
    {
      id: 'savings',
      status: 'active',
      type: 'savings',
      currency: 'USD',
      balance: { id: 'observation', observedAt: '2026-10-20T10:00:00Z', availableCents: 60000 },
    } as BankAccount,
  ]
  let r = financialInsights(s, insightInput(), now)
  expect(r.metrics.find((m) => m.key === 'net_debt_pressure')?.value).toBe(500)
  expect(r.metrics.find((m) => m.key === 'emergency_coverage')?.value).toBe(60)
  s.debts.push({ ...fictionalDebt('Unknown minimum'), updatedAt: now, minimumPaymentCents: null })
  r = financialInsights(s, insightInput(), now)
  expect(r.metrics.find((m) => m.key === 'net_debt_pressure')?.value).toBeNull()
  s.cashAccounts[0].balance!.observedAt = '2026-10-20T15:00:00Z'
  expect(
    financialInsights(s, insightInput(), now).metrics.find((m) => m.key === 'emergency_coverage')
      ?.value,
  ).toBeNull()
})
it('requires observed months for persistent budget pressure and sufficient completed years for seasonal bill patterns', () => {
  const s = insightFixture(),
    c = insightCategory()
  s.categories = [c]
  for (const month of ['2026-07', '2026-08', '2026-09']) {
    s.budgets ??= []
    s.budgets.push({ ...insightBudget(c.id, 1000), month })
    s.expenses.push(
      insightExpense(c.id, month + '-01', 1000),
      insightExpense(c.id, month + '-15', 1000),
    )
  }
  expect(
    financialInsights(s, insightInput(), now).insights.some(
      (i) => i.type === 'consistent_budget_over',
    ),
  ).toBe(true)
  s.expenses = s.expenses.filter((e) => !e.transactionDate.startsWith('2026-08'))
  expect(
    financialInsights(s, insightInput(), now).insights.some(
      (i) => i.type === 'consistent_budget_over',
    ),
  ).toBe(false)
  const bill = fictionalBill('Seasonal utility', 10000, '2026-10-21')
  s.bills = [bill]
  bill.periods = Array.from({ length: 30 }, (_, n) => ({
    ...bill.periods[0],
    id: 'period' + n,
    dueDate: new Date(Date.UTC(2024, n, 1)).toISOString().slice(0, 10),
    amountCents: 10000,
    paymentStatus: 'paid' as const,
    paidCents: 10000,
    remainingCents: 0,
  }))
  const r = financialInsights(s, insightInput(), now)
  expect(
    r.insights.some((i) => i.type === 'bill_pattern' && i.title.endsWith('same-month history')),
  ).toBe(true)
})
it('reviews distinct recurring subscription providers without assuming either is unnecessary', () => {
  const s = insightFixture(),
    c = insightCategory('Subscriptions')
  s.categories = [c]
  for (const merchant of ['Fictional music', 'Fictional movies'])
    for (const date of ['2026-08-20', '2026-09-20', '2026-10-20'])
      s.expenses.push(insightExpense(c.id, date, 1000, merchant))
  const insight = financialInsights(s, insightInput(), now).insights.find(
    (i) => i.type === 'similar_services_review',
  )!
  expect(insight).toMatchObject({ sampleCount: 2, impactCents: null, confidence: 'low' })
  expect(insight.explanation).toContain('purposes may differ')
})
it('uses all current days for budget performance even when equivalent trend windows stop at a shorter prior month', () => {
  const s = insightFixture(),
    c = insightCategory()
  s.categories = [c]
  s.budgets = [{ ...insightBudget(c.id, 1000), month: '2026-03' }]
  s.expenses = [insightExpense(c.id, '2026-03-31', 2000)]
  const r = financialInsights(s, insightInput(), '2026-03-31T12:00:00Z')
  expect(r.insights.find((i) => i.type === 'budget_over')).toMatchObject({
    currentCents: 2000,
    through: '2026-03-31',
  })
  expect(r.through).toBe('2026-03-28')
})
it('prioritizes essential funding gaps ahead of discretionary reviews at the same urgency', () => {
  const s = insightFixture(),
    c = insightCategory('Housing'),
    bill = fictionalBill('Rent', 120000, '2026-10-21')
  bill.categoryId = c.id
  bill.periods[0].categoryId = c.id
  s.categories = [c]
  s.bills = [bill]
  s.expenses = [insightExpense(c.id, '2026-10-19', 1000), insightExpense(c.id, '2026-10-19', 1000)]
  const r = financialInsights(s, insightInput(), now),
    important = r.insights.filter((i) => i.priority === 'important')
  expect(important[0].type).toBe('essential_gap')
  expect(important.some((i) => i.type === 'duplicate_review')).toBe(true)
})
