import { z } from 'zod'
const cents = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const money = cents.nonnegative()
const hours = z.number().int().min(0).max(16800)
const text = z.string().trim().max(160)
export const payrollCodes = [
  'regular',
  'overtime',
  'pto',
  'holiday',
  'bonus',
  'adjustment',
  'other_earning',
  'pretax_benefit',
  'federal',
  'social_security',
  'medicare',
  'state',
  'local',
  'roth',
  'traditional',
  'insurance',
  'disability',
  'other_deduction',
  'unknown',
] as const
export const deductionRuleSchema = z
  .object({
    code: z.enum(payrollCodes),
    label: text.min(1),
    applicable: z.boolean(),
    mode: z.enum(['unknown', 'fixed', 'rate', 'history']),
    fixedCents: money.nullable(),
    rateBps: z.number().int().min(0).max(10000).nullable(),
    basis: z.enum(['gross', 'gross_less_pretax']),
    annualWageCapCents: money.nullable(),
    priorTaxableWagesCents: money.nullable(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.mode === 'fixed' && v.fixedCents === null)
      c.addIssue({ code: 'custom', message: 'Enter a fixed deduction amount' })
    if (v.mode === 'rate' && v.rateBps === null)
      c.addIssue({ code: 'custom', message: 'Enter a configured rate' })
    if (v.annualWageCapCents !== null && v.priorTaxableWagesCents === null)
      c.addIssue({
        code: 'custom',
        message: 'A wage cap requires explicitly supplied prior taxable wages',
      })
  })
export const payrollProfileSchema = z
  .object({
    sourceId: z.uuid(),
    employer: text.min(1),
    assignment: text.nullable(),
    regularRateCents: money,
    overtimeRateCents: money,
    regularThresholdHundredths: hours,
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v })
        return true
      } catch {
        return false
      }
    }, 'Choose a valid time zone'),
    workweekStartDay: z.number().int().min(0).max(6),
    hoursDay: z.number().int().min(0).max(6),
    processingDay: z.number().int().min(0).max(6),
    statementDay: z.number().int().min(0).max(6),
    depositDay: z.number().int().min(0).max(6),
    rules: z.array(deductionRuleSchema).max(40),
  })
  .strict()
  .superRefine((v, c) => {
    if (new Set(v.rules.map((r) => r.code)).size !== v.rules.length)
      c.addIssue({ code: 'custom', message: 'Use one forecast rule per payroll component' })
  })
export const weeklyHoursSchema = z
  .object({
    sourceId: z.uuid(),
    workweekStart: z.iso.date(),
    workweekEnd: z.iso.date(),
    expectedPayDate: z.iso.date(),
    regularHundredths: hours,
    overtimeHundredths: hours,
    ptoHundredths: hours,
    holidayHundredths: hours,
    otherPaidHundredths: hours,
    unpaidHundredths: hours.nullable(),
    regularRateCents: money,
    overtimeRateCents: money,
    bonusCents: cents,
    adjustmentCents: cents,
    otherEarningsCents: cents,
    notes: z.string().trim().max(2000).nullable(),
  })
  .strict()
  .superRefine((v, c) => {
    if (Date.parse(v.workweekEnd) - Date.parse(v.workweekStart) !== 6 * 86400000)
      c.addIssue({
        code: 'custom',
        message: 'A workweek must contain seven inclusive calendar dates',
      })
    if (v.regularHundredths + v.overtimeHundredths > 16800)
      c.addIssue({ code: 'custom', message: 'Worked hours cannot exceed 168 per week' })
  })
export const payrollLineSchema = z
  .object({
    label: text.min(1),
    side: z.enum(['earnings', 'deduction', 'employer_tax', 'informational']),
    code: z.enum(payrollCodes),
    treatment: z.enum(['pretax', 'posttax', 'not_applicable', 'unknown']),
    currentCents: cents.nullable(),
    ytdCents: cents.nullable(),
    rateCents: money.nullable(),
    hoursHundredths: hours.nullable(),
    worked: z.boolean().nullable(),
    confidence: z.enum(['high', 'medium', 'low', 'manual']),
  })
  .strict()
export const payrollStatementSchema = z
  .object({
    deductionSign: z.enum(['positive', 'negative']).optional(),
    employer: text.nullable(),
    assignment: text.nullable(),
    periodStart: z.iso.date().nullable(),
    periodEnd: z.iso.date().nullable(),
    payDate: z.iso.date().nullable(),
    grossCents: money.nullable(),
    deductionsCents: money.nullable(),
    netCents: money.nullable(),
    lines: z.array(payrollLineSchema).max(150),
    acknowledgement: z.string().trim().max(2000).nullable(),
  })
  .strict()
export const payrollStages = [
  'hours_draft',
  'hours_submitted',
  'payroll_pending',
  'paystub_received',
  'paystub_reviewed',
  'deposit_confirmed',
] as const
export type PayrollProfileInput = z.infer<typeof payrollProfileSchema>
export type WeeklyHoursInput = z.infer<typeof weeklyHoursSchema>
export type PayrollLine = z.infer<typeof payrollLineSchema>
export type PayrollStatement = z.infer<typeof payrollStatementSchema>
export type PayrollProfile = PayrollProfileInput & {
  id: string
  revision: number
  updatedAt: string
}
export type PayrollForecast = {
  grossCents: number
  workedHundredths: number
  paidHundredths: number
  earnings: { code: string; amountCents: number }[]
  deductions: {
    code: string
    label: string
    amountCents: number | null
    method: string
    sampleCount: number
  }[]
  netCents: number | null
  range: { lowCents: number; highCents: number; sampleCount: number } | null
  confidence: 'unknown' | 'low' | 'medium'
  warnings: string[]
}
export type PayrollWeek = WeeklyHoursInput & {
  id: string
  householdId: string
  stage: (typeof payrollStages)[number]
  revision: number
  incomeTransactionId: string | null
  statementReceivedAt: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  statement: PayrollStatement | null
  forecasts: {
    id: string
    createdAt: string
    modelVersion: number
    eligibleForAccuracy: boolean
    result: PayrollForecast
  }[]
  canManage: boolean
}
export type PayrollData = { profiles: PayrollProfile[]; weeks: PayrollWeek[]; canManage: boolean }
