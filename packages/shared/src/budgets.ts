import { z } from 'zod'
import type { FinancialCategory } from './categories'
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const budgetMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine(
    (v) => v.slice(0, 4) >= '1900' && v.slice(0, 4) <= '9998',
    'Choose a supported calendar month',
  )
export const budgetSchema = z
  .object({
    month: budgetMonthSchema,
    responsibleMemberId: z.uuid().nullable(),
    totalCents: cents,
    notes: z.string().trim().max(4000).nullable(),
    status: z.enum(['active', 'archived']),
    limits: z.array(z.object({ categoryId: z.uuid(), amountCents: cents }).strict()).max(100),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.limits.map((l) => l.categoryId)).size !== v.limits.length)
      ctx.addIssue({ code: 'custom', message: 'Select each category once' })
    if (v.limits.reduce((n, l) => n + BigInt(l.amountCents), 0n) > BigInt(v.totalCents))
      ctx.addIssue({ code: 'custom', message: 'Category limits cannot exceed the total budget' })
  })
export const budgetCopySchema = z
  .object({
    sourceId: z.uuid(),
    sourceRevision: z.number().int().positive(),
    month: budgetMonthSchema,
  })
  .strict()
export type BudgetInput = z.infer<typeof budgetSchema>
export type Budget = BudgetInput & {
  id: string
  householdId: string
  revision: number
  createdAt: string
  updatedAt: string
  canManage: boolean
}
export type BudgetStatus = 'Within Budget' | 'Approaching Limit' | 'At Limit' | 'Over Budget'
export type BudgetCategoryRow = {
  categoryId: string | null
  name: string
  archived: boolean
  limitCents: number | null
  actualCents: number
  remainingCents: number | null
  overCents: number
  percent: number | null
  status: BudgetStatus | null
}
export type BudgetReport = {
  billDraft?: import('./budget-planning').BudgetBillDraft
  month: string
  responsibleMemberId: string | null
  budget: Budget | null
  records: Budget[]
  canCreate: boolean
  categories: FinancialCategory[]
  members: { id: string; fullName: string; status: string }[]
  rows: BudgetCategoryRow[]
  actualCents: number
  remainingCents: number | null
  overCents: number
  previous: { month: string; actualCents: number; plannedCents: number | null }
  bills: {
    id: string
    name: string
    dueDate: string
    estimateCents: number | null
    estimateIsVariable?: boolean
    billedCents: number | null
    paidCents: number
    remainingCents: number | null
  }[]
}
