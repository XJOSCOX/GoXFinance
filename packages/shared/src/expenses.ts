import { z } from 'zod'
import { debtPaymentMethodSchema } from './debt-payments'
import type { FinancialCategory } from './categories'

export type ExpenseCategory = Pick<FinancialCategory, 'id' | 'householdId' | 'name' | 'createdAt'> &
  Partial<Pick<FinancialCategory, 'archived'>>
export const expenseInputSchema = z
  .object({
    responsibleMemberId: z.uuid(),
    description: z.string().trim().min(1).max(240),
    merchant: z.string().trim().max(160).nullable(),
    amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    transactionDate: z.iso.date(),
    paymentMethod: debtPaymentMethodSchema,
    linkedDebtId: z.uuid().nullable(),
    notes: z.string().trim().max(4000).nullable(),
    allocations: z
      .array(
        z
          .object({
            categoryId: z.uuid(),
            amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .superRefine((value, ctx) => {
    const sum = value.allocations.reduce((total, item) => total + item.amountCents, 0)
    if (!Number.isSafeInteger(sum) || sum !== value.amountCents)
      ctx.addIssue({
        code: 'custom',
        message: 'Category allocations must equal the expense total',
        path: ['allocations'],
      })
    if (new Set(value.allocations.map((item) => item.categoryId)).size !== value.allocations.length)
      ctx.addIssue({ code: 'custom', message: 'Use each category once', path: ['allocations'] })
    if (value.linkedDebtId && value.paymentMethod !== 'credit_card')
      ctx.addIssue({
        code: 'custom',
        message: 'Debt links are available only for credit-card purchases',
      })
  })
export const createExpenseSchema = z
  .object({ idempotencyKey: z.uuid(), expense: expenseInputSchema })
  .strict()
export const editExpenseSchema = z
  .object({ revision: z.number().int().positive(), expense: expenseInputSchema })
  .strict()
export type ExpenseInput = z.infer<typeof expenseInputSchema>
export type Expense = ExpenseInput & {
  id: string
  householdId: string
  createdByUserId: string
  createdAt: string
  updatedAt: string
  voided: boolean
  revision: number
  canManage: boolean
}
export type ExpenseAudit = {
  id: string
  actorUserId: string
  action: string
  beforeJson: string | null
  afterJson: string | null
  createdAt: string
}
