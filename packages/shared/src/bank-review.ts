import { z } from 'zod'
import { expenseInputSchema } from './expenses'
import type { Expense, ExpenseCategory } from './expenses'
import type { BillView } from './bills'
import type { Debt } from './debts'
import type { DebtPayment } from './debt-payments'
import type { IncomeData } from './income'
import type { BankAccount, BankTransaction, BankClassification } from './banking'
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  allocation = z
    .object({
      categoryId: z.uuid(),
      amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
  breakdown = { principalAmountCents: amount, interestAmountCents: amount, feesAmountCents: amount }
export const bankProposalSchema = z
  .discriminatedUnion('classification', [
    z
      .object({
        classification: z.literal('expense'),
        expenseId: z.uuid().nullable(),
        expense: expenseInputSchema.nullable(),
      })
      .strict(),
    z
      .object({
        classification: z.literal('fee'),
        expenseId: z.uuid().nullable(),
        expense: expenseInputSchema.nullable(),
      })
      .strict(),
    z
      .object({
        classification: z.literal('bill_payment'),
        billId: z.uuid(),
        periodId: z.uuid(),
        paymentId: z.uuid().nullable(),
        billedAmountCents: amount,
        ...breakdown,
      })
      .strict(),
    z
      .object({
        classification: z.literal('debt_payment'),
        debtId: z.uuid(),
        paymentId: z.uuid().nullable(),
        ...breakdown,
      })
      .strict(),
    z
      .object({
        classification: z.literal('income'),
        sourceId: z.uuid(),
        transactionId: z.uuid().nullable(),
        confirmPending: z.boolean(),
        actualGrossCents: amount,
        deductionsCents: amount,
      })
      .strict(),
    z
      .object({ classification: z.literal('transfer'), counterpartId: z.uuid().nullable() })
      .strict(),
    z
      .object({
        classification: z.literal('refund'),
        originalType: z.enum(['expense', 'bill_payment', 'debt_payment']),
        originalId: z.uuid(),
        allocations: z.array(allocation).max(30),
      })
      .strict(),
    z
      .object({ classification: z.literal('ignore'), reason: z.string().trim().min(1).max(500) })
      .strict(),
  ])
  .superRefine((p, ctx) => {
    if (
      (p.classification === 'expense' || p.classification === 'fee') &&
      !!p.expenseId === !!p.expense
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Create an expense or link one existing expense, never both.',
      })
  })
export type BankProposal = z.infer<typeof bankProposalSchema>
export const bankReviewSchema = z
  .object({
    idempotencyKey: z.uuid(),
    revision: z.number().int().positive(),
    proposal: bankProposalSchema,
    newRecordConfirmed: z.boolean().default(false),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export const bankReviewPreviewSchema = z
  .object({
    revision: z.number().int().positive(),
    proposal: bankProposalSchema,
    newRecordConfirmed: z.boolean().default(false),
  })
  .strict()
export type BankMatch = {
  classification: BankClassification
  id: string
  parentId: string | null
  reason: string
}
export type BankReviewOptions = {
  refund?: {
    id: string
    status: string
    originalType: 'expense' | 'bill_payment' | 'debt_payment'
    originalId: string
    allocations: { categoryId: string; amountCents: number }[]
  }
  transaction: BankTransaction
  account: BankAccount
  owner: boolean
  canReview: boolean
  members: { id: string; name: string }[]
  expenses: Expense[]
  categories: ExpenseCategory[]
  bills: BillView[]
  debts: Debt[]
  payments: DebtPayment[]
  income: IncomeData
  counterpartTransactions: BankTransaction[]
  matches: BankMatch[]
  existingLink: { classification: BankClassification; id: string; needsReview: boolean } | null
}
export type FinancialRefund = {
  id: string
  expenseId: string | null
  billPaymentId: string | null
  debtPaymentId: string | null
  amountCents: number
  date: string
  method: string
  status: 'completed' | 'cancelled'
  memberIds: string[]
  allocations: { categoryId: string | null; amountCents: number }[]
}
