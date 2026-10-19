import { z } from 'zod'

export const defaultFinancialCategories = [
  'Housing',
  'Utilities',
  'Internet & Phone',
  'Groceries',
  'Dining & Takeout',
  'Transportation',
  'Insurance',
  'Debt Repayment',
  'Healthcare',
  'Children & Family',
  'Shopping',
  'Household Supplies',
  'Subscriptions',
  'Education',
  'Entertainment',
  'Travel',
  'Taxes & Government',
  'Gifts & Donations',
  'Personal Care',
  'Other',
] as const
export const normalizeCategoryName = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().default(null),
    icon: z
      .string()
      .regex(/^[a-z0-9-]{1,60}$/)
      .nullable()
      .default(null),
  })
  .strict()
export const categoryEditSchema = categoryInputSchema
  .extend({ revision: z.number().int().positive(), archived: z.boolean() })
  .strict()
export type CategoryInput = z.output<typeof categoryInputSchema>
export type FinancialCategory = CategoryInput & {
  id: string
  householdId: string
  archived: boolean
  revision: number
  createdAt: string
  updatedAt: string
  usage: { bills: number; billPeriods: number; debts: number; expenses: number }
}
