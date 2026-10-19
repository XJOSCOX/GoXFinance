import { z } from 'zod'

export const incomeTypeLabels = {
  hourly: 'Hourly employment',
  salary: 'Salary',
  self_employment: 'Self-employment',
  military: 'Military pay',
  benefits: 'Benefits',
  trading_payout: 'Withdrawn trading payout',
  other: 'Other',
}
export const incomeFrequencyLabels = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  semimonthly: 'Semimonthly',
  monthly: 'Monthly',
  annually: 'Annually',
  irregular: 'Irregular',
}
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable()
export const incomeSourceSchema = z
  .object({
    responsibleMemberId: z.uuid(),
    name: z.string().trim().min(1).max(160),
    incomeType: z.enum([
      'hourly',
      'salary',
      'self_employment',
      'military',
      'benefits',
      'trading_payout',
      'other',
    ]),
    frequency: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly', 'annually', 'irregular']),
    hourlyRateCents: cents,
    expectedGrossCents: cents,
    expectedNetCents: cents,
    payday: z.number().int().min(0).max(6).nullable(),
    overtimeMultiplier: z
      .string()
      .regex(/^\d{1,2}(?:\.\d{1,3})?$/)
      .refine((v) => Number(v) >= 0 && Number(v) <= 10, 'Multiplier must be between 0 and 10'),
    status: z.enum(['active', 'inactive']),
    notes: z.string().trim().max(4000).nullable(),
  })
  .strict()
const hours = z
  .string()
  .regex(/^\d{1,4}(?:\.\d{1,2})?$/, 'Use up to two decimal places for hours')
  .refine((v) => Number(v) <= 1000, 'Hours cannot exceed 1,000')
  .nullable()
export const incomeTransactionSchema = z
  .object({
    sourceId: z.uuid(),
    workPeriodStart: z.iso.date().nullable(),
    workPeriodEnd: z.iso.date().nullable(),
    regularHours: hours,
    overtimeHours: hours,
    hourlyRateCents: cents,
    overtimeMultiplier: incomeSourceSchema.shape.overtimeMultiplier,
    expectedGrossCents: cents,
    expectedNetCents: cents,
    actualGrossCents: cents,
    deductionsCents: cents,
    actualNetCents: cents,
    payDate: z.iso.date(),
    depositDate: z.iso.date().nullable(),
    status: z.enum(['expected', 'pending', 'confirmed', 'cancelled']),
    reference: z.string().trim().min(1).max(160).nullable(),
    notes: z.string().trim().max(4000).nullable(),
    receiptConfirmed: z.boolean(),
    tradingPayoutWithdrawn: z.boolean(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (
      Boolean(v.workPeriodStart) !== Boolean(v.workPeriodEnd) ||
      (v.workPeriodStart && v.workPeriodEnd && v.workPeriodEnd < v.workPeriodStart)
    )
      issue('Enter a valid work period start and end')
    if (
      v.status === 'confirmed' &&
      (v.actualNetCents === null || !v.depositDate || !v.receiptConfirmed)
    )
      issue('Confirm the actual net deposit and deposit date before confirming income')
    if (
      v.actualGrossCents !== null &&
      v.deductionsCents !== null &&
      v.deductionsCents > v.actualGrossCents
    )
      issue('Deductions cannot exceed gross pay')
  })
export type IncomeSourceInput = z.infer<typeof incomeSourceSchema>
export type IncomeTransactionInput = z.infer<typeof incomeTransactionSchema>
export type IncomeSource = IncomeSourceInput & {
  id: string
  householdId: string
  createdByUserId: string
  revision: number
  isArchived: boolean
  createdAt: string
  updatedAt: string
  canManage: boolean
}
export type IncomeTransaction = IncomeTransactionInput & {
  id: string
  householdId: string
  responsibleMemberId: string
  createdByUserId: string
  incomeTypeSnapshot: IncomeSourceInput['incomeType']
  frequencySnapshot: IncomeSourceInput['frequency']
  estimatedGrossCents: number | null
  confirmedAt: string | null
  revision: number
  createdAt: string
  updatedAt: string
  canManage: boolean
}
export type IncomeAudit = {
  id: string
  action: string
  actorUserId: string
  createdAt: string
  beforeJson: string | null
  afterJson: string | null
}
export type IncomeData = {
  sources: IncomeSource[]
  transactions: IncomeTransaction[]
  canCreate: boolean
}
export const createIncomeSourceSchema = z
  .object({ idempotencyKey: z.uuid(), values: incomeSourceSchema })
  .strict()
export const editIncomeSourceSchema = z
  .object({
    revision: z.number().int().positive(),
    values: incomeSourceSchema,
    reason: z.string().trim().min(1).max(2000),
  })
  .strict()
export const createIncomeTransactionSchema = z
  .object({ idempotencyKey: z.uuid(), values: incomeTransactionSchema })
  .strict()
export const editIncomeTransactionSchema = z
  .object({
    revision: z.number().int().positive(),
    values: incomeTransactionSchema,
    reason: z.string().trim().min(1).max(2000),
  })
  .strict()
