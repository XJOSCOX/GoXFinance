import { expect, it } from 'vitest'
import { categoryReport } from './category-report'
import type { BillView } from './bills'
import type { Debt } from './debts'
import type { Expense } from './expenses'
import type { DebtPayment } from './debt-payments'

it('keeps obligations, credit purchases, cash outflows and debt balances separate with linked bills counted once', () => {
  const debt = {
    id: 'debt',
    householdId: 'home',
    isArchived: false,
    categoryId: 'repayment',
    currentBalanceCents: 100000,
    minimumPaymentCents: 10000,
    confidence: 'confirmed',
    memberAssignments: [],
    duplicateLinkVerified: false,
  } as unknown as Debt
  const payment = {
    id: 'authoritative',
    debtId: 'debt',
    amountCents: 10000,
    paymentStatus: 'completed',
    paymentDate: '2026-10-10',
    paymentMethod: 'bank_transfer',
  } as DebtPayment
  const bill = {
    id: 'auto',
    categoryId: 'transport',
    linkedDebtId: 'debt',
    status: 'active',
    kind: 'recurring',
    endDate: null,
    amountType: 'fixed',
    amountCents: 15000,
    frequency: 'monthly',
    periods: [{ id: 'period', categoryId: 'transport' }],
    payments: [
      {
        id: 'alias',
        billId: 'auto',
        periodId: 'period',
        debtPaymentId: 'authoritative',
        amountCents: 10000,
        paymentDate: '2026-10-10',
        status: 'completed',
      },
    ],
  } as unknown as BillView
  const expense = {
    id: 'expense',
    voided: false,
    transactionDate: '2026-10-10',
    amountCents: 10000,
    paymentMethod: 'credit_card',
    allocations: [
      { categoryId: 'groceries', amountCents: 6000 },
      { categoryId: 'dining', amountCents: 4000 },
    ],
  } as Expense
  const rows = categoryReport(
    [bill],
    [debt],
    [expense],
    [payment, payment],
    '2026-10',
    '2026-10-19',
  )
  expect(rows.find((row) => row.categoryId === 'transport')).toMatchObject({
    expectedCents: 15000,
    spendingCents: 0,
    cashOutflowCents: 10000,
  })
  expect(rows.find((row) => row.categoryId === 'repayment')).toMatchObject({
    expectedCents: 0,
    debtBalanceCents: 100000,
    spendingCents: 0,
  })
  expect(rows.find((row) => row.categoryId === 'groceries')).toMatchObject({
    spendingCents: 6000,
    cashOutflowCents: 0,
  })
  expect(rows.reduce((sum, row) => sum + row.spendingCents, 0)).toBe(10000)
  expect(rows.reduce((sum, row) => sum + row.cashOutflowCents, 0)).toBe(10000)
})
it('preserves unknown debt amounts and excludes pending payments, voids, other months and future outflows', () => {
  const debt = {
    id: 'debt',
    householdId: 'home',
    isArchived: false,
    currentBalanceCents: null,
    minimumPaymentCents: null,
    confidence: 'unverified',
    memberAssignments: [],
    duplicateLinkVerified: false,
  } as unknown as Debt
  const payments = [
    {
      id: 'pending',
      debtId: 'debt',
      amountCents: 10000,
      paymentStatus: 'pending',
      paymentDate: '2026-10-10',
      paymentMethod: 'cash',
    },
    {
      id: 'future',
      debtId: 'debt',
      amountCents: 10000,
      paymentStatus: 'completed',
      paymentDate: '2026-10-30',
      paymentMethod: 'cash',
    },
  ] as DebtPayment[]
  expect(categoryReport([], [debt], [], payments, '2026-10', '2026-10-19')).toEqual([
    {
      categoryId: null,
      expectedCents: 0,
      spendingCents: 0,
      cashOutflowCents: 0,
      debtBalanceCents: 0,
      unknownExpectedCount: 1,
      unknownDebtCount: 1,
    },
  ])
})
