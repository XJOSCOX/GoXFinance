import { expect, it } from 'vitest'
import { budgetSchema } from './budgets'
import {
  budgetUsage,
  budgetSpending,
  budgetCategoryRows,
  previousBudgetMonth,
  budgetBillObligations,
} from './budget-calculations'
import type { BillView } from './bills'
import type { Expense } from './expenses'
import type { FinancialCategory } from './categories'
const expense = {
  id: 'e',
  responsibleMemberId: 'a',
  voided: false,
  transactionDate: '2026-10-03',
  amountCents: 10000,
  paymentMethod: 'credit_card',
  allocations: [
    { categoryId: 'food', amountCents: 6000 },
    { categoryId: 'dining', amountCents: 4000 },
  ],
} as Expense
const payment = {
  id: 'paid',
  billId: 'bill',
  periodId: 'period',
  status: 'completed',
  paymentDate: '2026-10-03',
  amountCents: 20000,
  method: 'bank_transfer',
  debtId: null,
  debtPaymentId: null,
}
const bill = {
  id: 'bill',
  memberIds: ['a', 'b'],
  categoryId: 'new-category',
  linkedDebtId: null,
  kind: 'recurring',
  status: 'active',
  amountType: 'variable',
  estimatedAmountCents: 30000,
  frequency: 'monthly',
  endDate: null,
  periods: [
    {
      id: 'period',
      name: 'Utility',
      dueDate: '2026-10-03',
      categoryId: 'utility',
      estimatedAmountCents: 30000,
      amountCents: 34218,
      paidCents: 20000,
      remainingCents: 14218,
      paymentStatus: 'partially_paid',
      linkedDebtId: null,
    },
  ],
  payments: [payment],
} as unknown as BillView
it('uses the current bill name while preserving historical period amounts and labels', () => {
  const renamed = {
    ...bill,
    name: 'Fictional electricity',
    periods: bill.periods.map((p) => ({ ...p, name: '300' })),
  }
  const before = JSON.stringify(renamed)
  expect(budgetBillObligations([renamed], '2026-10', null)[0]).toMatchObject({
    name: 'Fictional electricity',
    estimateCents: 30000,
    billedCents: 34218,
    paidCents: 20000,
    remainingCents: 14218,
  })
  expect(JSON.stringify(renamed)).toBe(before)
  expect(renamed.periods[0].name).toBe('300')
})
it('uses split purchase spending, historical bill categories, actual partial payments and no linked repayment aliases', () => {
  const rows = budgetSpending(
    [
      expense,
      expense,
      { ...expense, id: 'void', voided: true },
      { ...expense, id: 'future', transactionDate: '2099-01-01' },
    ],
    [
      {
        ...bill,
        payments: [
          payment,
          payment,
          ...['pending', 'scheduled', 'failed', 'cancelled'].map((status) => ({
            ...payment,
            id: status,
            status,
          })),
        ],
      },
      {
        ...bill,
        id: 'linked',
        linkedDebtId: 'debt',
        payments: [{ ...payment, id: 'alias', billId: 'linked', debtPaymentId: 'debt-payment' }],
      },
    ] as BillView[],
    '2026-10',
    null,
    '2026-10-20',
  )
  expect(rows.find((r) => r.categoryId === 'food')?.actualCents).toBe(6000)
  expect(rows.find((r) => r.categoryId === 'dining')?.actualCents).toBe(4000)
  expect(rows.find((r) => r.categoryId === 'utility')?.actualCents).toBe(20000)
  expect(rows.reduce((n, r) => n + r.actualCents, 0)).toBe(30000)
  expect(budgetBillObligations([bill], '2026-10', null)[0]).toMatchObject({
    estimateCents: 30000,
    billedCents: 34218,
    paidCents: 20000,
    remainingCents: 14218,
  })
})
it('keeps overlapping member scopes separate; corrections, cancellations and month boundaries recalculate', () => {
  const total = (member: string | null) =>
    budgetSpending([expense], [bill], '2026-10', member, '2026-10-20').reduce(
      (n, r) => n + r.actualCents,
      0,
    )
  expect(total(null)).toBe(30000)
  expect(total('a')).toBe(30000)
  expect(total('b')).toBe(20000)
  const changed = {
    ...expense,
    amountCents: 5000,
    allocations: [{ categoryId: 'food', amountCents: 5000 }],
  }
  expect(
    budgetSpending(
      [changed],
      [{ ...bill, payments: [{ ...payment, status: 'cancelled' }] }] as BillView[],
      '2026-10',
      null,
      '2026-10-20',
    ).reduce((n, r) => n + r.actualCents, 0),
  ).toBe(5000)
  expect(
    budgetSpending([expense], [], '2026-09', null, '2026-10-20').reduce(
      (n, r) => n + r.actualCents,
      0,
    ),
  ).toBe(0)
  expect(previousBudgetMonth('2027-01')).toBe('2026-12')
})
it.each([
  [0, 'Within Budget'],
  [7999, 'Within Budget'],
  [8000, 'Approaching Limit'],
  [9999, 'Approaching Limit'],
  [10000, 'At Limit'],
  [10001, 'Over Budget'],
])('classifies spending %s at the exact boundary', (actual, status) => {
  expect(budgetUsage(10000, actual as number).status).toBe(status)
})
it('handles zero limits, archived categories, unbudgeted spending and safe large thresholds', () => {
  expect(budgetUsage(0, 0)).toMatchObject({ status: 'At Limit', percent: 0 })
  expect(budgetUsage(0, 1)).toMatchObject({ status: 'Over Budget', overCents: 1 })
  expect(budgetUsage(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1).status).toBe(
    'Approaching Limit',
  )
  const rows = budgetCategoryRows(
    { limits: [{ categoryId: 'food', amountCents: 5000 }] } as never,
    [{ id: 'food', name: 'Historical food', archived: true }] as FinancialCategory[],
    [
      { categoryId: 'food', actualCents: 6000 },
      { categoryId: null, actualCents: 1000 },
    ],
  )
  expect(rows.find((r) => r.categoryId === 'food')).toMatchObject({
    archived: true,
    overCents: 1000,
    status: 'Over Budget',
  })
  expect(rows.find((r) => r.categoryId === null)).toMatchObject({
    limitCents: null,
    actualCents: 1000,
    status: null,
  })
})
it('validates integer cents, duplicate categories, month and allocation totals', () => {
  const base = {
    month: '2026-10',
    responsibleMemberId: null,
    totalCents: 10000,
    status: 'active',
    notes: null,
    limits: [],
  }
  expect(budgetSchema.safeParse(base).success).toBe(true)
  for (const change of [
    { totalCents: 1.5 },
    { month: '2026-13' },
    { totalCents: -1 },
    { limits: [{ categoryId: 'not-a-uuid', amountCents: 1 }] },
  ])
    expect(budgetSchema.safeParse({ ...base, ...change }).success).toBe(false)
  const c = '10000000-0000-4000-8000-000000000001'
  expect(
    budgetSchema.safeParse({ ...base, limits: [{ categoryId: c, amountCents: 10001 }] }).success,
  ).toBe(false)
  expect(
    budgetSchema.safeParse({
      ...base,
      limits: [
        { categoryId: c, amountCents: 1 },
        { categoryId: c, amountCents: 1 },
      ],
    }).success,
  ).toBe(false)
})

it('preserves a standalone payment historical classification when the current bill category or debt link changes', () => {
  const changed = {
    ...bill,
    linkedDebtId: 'new-debt',
    categoryId: 'new-category',
    periods: [{ ...bill.periods[0], linkedDebtId: null, categoryId: null }],
  }
  const rows = budgetSpending([], [changed], '2026-10', null, '2026-10-20')
  expect(rows.find((r) => r.categoryId === null)?.actualCents).toBe(20000)
  expect(rows.find((r) => r.categoryId === 'new-category')?.actualCents ?? 0).toBe(0)
})

it('does not turn a future obligation estimate into actual spending or calculate unrelated forecast amounts', () => {
  expect(
    budgetSpending(
      [],
      [
        {
          ...bill,
          estimatedAmountCents: Number.MAX_SAFE_INTEGER,
          frequency: 'weekly',
          payments: [],
        },
      ],
      '2026-10',
      null,
      '2026-10-20',
    ),
  ).toEqual([])
})
