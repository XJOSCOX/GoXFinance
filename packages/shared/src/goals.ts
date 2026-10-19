import { z } from 'zod'
import { tradingTimezone } from './trading'
const amount = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
export const goalSchema = z
  .object({
    timezone: tradingTimezone.nullable().default(null),
    sessionStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .default(null),
    name: z.string().trim().min(1).max(160),
    goalType: z.enum([
      'trading_profit',
      'trading_loss',
      'confirmed_income',
      'savings',
      'debt_reduction',
      'spending_limit',
      'bill_completion',
      'manual',
    ]),
    targetCents: amount.nonnegative(),
    period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom']),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    responsibleMemberId: z.uuid().nullable(),
    tradingAccountId: z.uuid().nullable(),
    copyGroupId: z.uuid().nullable(),
    direction: z.enum(['at_least', 'at_most']),
    status: z.enum(['active', 'paused', 'completed']),
    notes: z.string().trim().max(4000).nullable(),
  })
  .strict()
  .refine((v) => v.endDate >= v.startDate, 'End date cannot precede start date')
  .refine(
    (v) =>
      (!(v.tradingAccountId || v.copyGroupId) ||
        ['trading_profit', 'trading_loss'].includes(v.goalType)) &&
      !(v.tradingAccountId && v.copyGroupId),
    'Only trading goals may link an account',
  )
export const goalContributionSchema = z
  .object({
    goalId: z.uuid(),
    amountCents: amount,
    date: z.iso.date(),
    notes: z.string().trim().min(1).max(2000),
  })
  .strict()
export type GoalInput = z.infer<typeof goalSchema>
export type GoalContribution = z.infer<typeof goalContributionSchema> & {
  id: string
  householdId: string
  revision: number
  createdAt: string
  updatedAt: string
  canManage: boolean
}
export type GoalProgress = {
  notStarted: boolean
  startDate: string
  endDate: string
  actualCents: number | null
  shortfallCents: number | null
  overageCents: number | null
  met: boolean | null
  incomplete: boolean
  source: string
}
export type Goal = GoalInput & {
  id: string
  householdId: string
  revision: number
  createdAt: string
  updatedAt: string
  canManage: boolean
  progress: GoalProgress
  history: GoalProgress[]
}
export type GoalsData = { goals: Goal[]; contributions: GoalContribution[]; canCreate: boolean }
