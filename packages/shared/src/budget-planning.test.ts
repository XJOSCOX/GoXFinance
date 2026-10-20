import { expect, it } from 'vitest'
import type { BillView } from './bills'
import type { FinancialCategory } from './categories'
import { budgetFromBills } from './budget-planning'
const categories = [{ id: 'utilities', archived: false }] as FinancialCategory[]
const bill = {
  id: 'bill',
  name: 'Electricity',
  status: 'active',
  memberIds: ['a', 'b'],
  categoryId: 'utilities',
  kind: 'recurring',
  amountType: 'variable',
  amountCents: null,
  estimatedAmountCents: 30000,
  nextDueDate: '2026-10-03',
  endDate: null,
  frequency: 'monthly',
  linkedDebtId: null,
  periods: [],
  payments: [],
} as unknown as BillView
it('prefills saved estimates without creating actual bills, payments or spending, including future months', () => {
  const original = structuredClone(bill)
  expect(budgetFromBills([bill, bill], categories, '2026-11', null)).toMatchObject({
    totalCents: 30000,
    limits: [{ categoryId: 'utilities', amountCents: 30000 }],
    rows: [{ basis: 'Saved estimate', dueDate: '2026-11-03', included: true }],
  })
  expect(bill).toEqual(original)
  expect(budgetFromBills([bill], categories, '2026-11', 'unrelated').totalCents).toBe(0)
})
it('uses historical actual amounts once, preserving estimate and payments independently', () => {
  const b = {
    ...bill,
    periods: [
      {
        id: 'p',
        dueDate: '2026-10-03',
        name: 'Electricity',
        categoryId: 'utilities',
        linkedDebtId: null,
        amountCents: 34218,
        estimatedAmountCents: 30000,
        paidCents: 20000,
        remainingCents: 14218,
        paymentStatus: 'partially_paid',
      },
    ],
  } as BillView
  const draft = budgetFromBills([b], categories, '2026-10', 'a')
  expect(draft.rows).toHaveLength(1)
  expect(draft.totalCents).toBe(34218)
  expect(draft.rows[0].basis).toBe('Actual billed amount (planning only)')
  expect(b.periods[0].remainingCents).toBe(14218)
  expect(b.periods[0].estimatedAmountCents).toBe(30000)
})
it('handles calendar frequencies, month ends, end dates and one-time bills', () => {
  expect(
    budgetFromBills([{ ...bill, frequency: 'weekly' }], categories, '2026-10', null).totalCents,
  ).toBe(150000)
  expect(
    budgetFromBills([{ ...bill, frequency: 'biweekly' }], categories, '2026-10', null).totalCents,
  ).toBe(90000)
  expect(
    budgetFromBills([{ ...bill, frequency: 'quarterly' }], categories, '2026-11', null).totalCents,
  ).toBe(0)
  expect(
    budgetFromBills([{ ...bill, frequency: 'annually' }], categories, '2027-10', null).totalCents,
  ).toBe(30000)
  expect(
    budgetFromBills([{ ...bill, nextDueDate: '2026-01-31' }], categories, '2026-02', null).rows[0]
      .dueDate,
  ).toBe('2026-02-28')
  expect(
    budgetFromBills([{ ...bill, endDate: '2026-10-03' }], categories, '2026-11', null).rows,
  ).toEqual([])
  expect(
    budgetFromBills([{ ...bill, kind: 'one_time', frequency: null }], categories, '2026-11', null)
      .rows,
  ).toEqual([])
})
it('excludes inactive, unknown, debt transfers and invalid categories; preserves valid zero amounts', () => {
  const variants = [
    { ...bill, id: 'inactive', status: 'inactive' },
    { ...bill, id: 'debt', linkedDebtId: 'debt' },
    { ...bill, id: 'unknown', estimatedAmountCents: null },
    { ...bill, id: 'unclassified', categoryId: null },
    { ...bill, id: 'zero', estimatedAmountCents: 0 },
  ] as BillView[]
  const draft = budgetFromBills(variants, categories, '2026-10', null)
  expect(draft.rows).toHaveLength(4)
  expect(draft.rows.filter((r) => r.included).map((r) => r.billId)).toEqual(['zero'])
  expect(draft.totalCents).toBe(0)
  expect(
    budgetFromBills([bill], [{ ...categories[0], archived: true }], '2026-10', null).limits,
  ).toEqual([])
})
