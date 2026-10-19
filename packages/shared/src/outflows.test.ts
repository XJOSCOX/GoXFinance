import { expect, it } from 'vitest'
import type { Expense } from './expenses'
import { expenseInputSchema } from './expenses'
import { cashOutflows, sumCents } from './outflows'
import type { BillPayment } from './bills'
import type { DebtPayment } from './debt-payments'
import { randomUUID } from 'node:crypto'

it('counts credit-card purchases once as spending and repayments once as cash', () => {
  const expenses = [
    {
      id: 'purchase',
      amountCents: 5000,
      paymentMethod: 'credit_card',
      transactionDate: '2026-10-01',
      voided: false,
    },
    { id: 'void', amountCents: 8000, paymentMethod: 'cash', voided: true },
  ] as Expense[]
  const debts = [
    {
      id: 'repayment',
      amountCents: 5000,
      paymentMethod: 'bank_transfer',
      paymentDate: '2026-10-02',
      paymentStatus: 'completed',
    },
  ] as DebtPayment[]
  const bill = (
    id: string,
    amountCents: number,
    status: BillPayment['status'],
    debtPaymentId: string | null = null,
  ): BillPayment => ({
    id,
    amountCents,
    status,
    debtPaymentId,
    method: 'cash',
    paymentDate: '2026-10-03',
    householdId: 'home',
    billId: 'bill',
    periodId: 'period',
    debtId: debtPaymentId ? 'debt' : null,
    notes: null,
    createdByUserId: 'owner',
    createdAt: '',
    updatedAt: '',
  })
  const bills = [
    bill('linked', 5000, 'completed', 'repayment'),
    bill('pending', 1000, 'pending'),
    bill('utility', 2000, 'completed'),
  ]
  const result = cashOutflows(expenses, bills, [...debts, ...debts])
  expect(sumCents(result.map((item) => item.spendingCents))).toBe(7000)
  expect(sumCents(result.map((item) => item.cashOutflowCents))).toBe(7000)
  expect(result).toHaveLength(3)
})
it('rejects invalid or duplicated category splits', () => {
  const category = randomUUID(),
    value = {
      responsibleMemberId: randomUUID(),
      description: 'Purchase',
      merchant: null,
      amountCents: 1000,
      transactionDate: '2026-10-01',
      paymentMethod: 'cash',
      linkedDebtId: null,
      notes: null,
      allocations: [{ categoryId: category, amountCents: 1000 }],
    }
  expect(expenseInputSchema.safeParse(value).success).toBe(true)
  expect(
    expenseInputSchema.safeParse({
      ...value,
      allocations: [{ categoryId: category, amountCents: 999 }],
    }).success,
  ).toBe(false)
  expect(
    expenseInputSchema.safeParse({
      ...value,
      allocations: [
        { categoryId: category, amountCents: 500 },
        { categoryId: category, amountCents: 500 },
      ],
    }).success,
  ).toBe(false)
  expect(expenseInputSchema.safeParse({ ...value, amountCents: 1.2 }).success).toBe(false)
})
it('rejects unsafe aggregate totals', () =>
  expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow())
