import { z } from 'zod'
import { payrollFrequencies, payrollPeriodIssue, payrollPeriodDays } from './payroll-periods'
const cents = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const money = cents.nonnegative()
const hours = z.number().int().min(0).max(878400)
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
    payFrequency: z.enum(payrollFrequencies).optional(),
    periodAnchor: z.iso.date().nullable().optional(),
    semiMonthlySplitDay: z.number().int().min(1).max(27).optional(),
    depositOffsetDays: z.number().int().min(-31).max(60).nullable().optional(),
    regularRateCents: money.nullable(),
    overtimeRateCents: money.nullable(),
    regularThresholdHundredths: hours.max(16800).nullable(),
    milestonesConfigured: z.boolean().optional(),
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
    expectedPayDate: z.iso.date().nullable(),
    payFrequency: z.enum(payrollFrequencies).optional(),
    semiMonthlySplitDay: z.number().int().min(1).max(27).optional(),
    documentOnly: z.boolean().optional(),
    expectedDepositBasis: z.enum(['statement', 'schedule']).optional(),
    periodAnchor: z.iso.date().nullable().optional(),
    regularHundredths: hours.nullable(),
    overtimeHundredths: hours.nullable(),
    ptoHundredths: hours.nullable(),
    holidayHundredths: hours.nullable(),
    otherPaidHundredths: hours.nullable(),
    unpaidHundredths: hours.nullable(),
    regularRateCents: money.nullable(),
    overtimeRateCents: money.nullable(),
    bonusCents: cents,
    adjustmentCents: cents,
    otherEarningsCents: cents,
    notes: z.string().trim().max(2000).nullable(),
  })
  .strict()
  .superRefine((v, c) => {
    const periodIssue = payrollPeriodIssue(
      v.workweekStart,
      v.workweekEnd,
      v.payFrequency ?? 'weekly',
      v.semiMonthlySplitDay ?? 15,
      v.periodAnchor,
    )
    if (periodIssue)
      c.addIssue({
        code: 'custom',
        message: periodIssue,
      })
    if (
      !v.documentOnly &&
      [
        v.expectedPayDate,
        v.regularHundredths,
        v.overtimeHundredths,
        v.ptoHundredths,
        v.holidayHundredths,
        v.otherPaidHundredths,
        v.regularRateCents,
        v.overtimeRateCents,
      ].some((n) => n === null)
    )
      c.addIssue({ code: 'custom', message: 'Reported hours and rates must be entered explicitly' })
    if (
      (v.regularHundredths ?? 0) + (v.overtimeHundredths ?? 0) >
      payrollPeriodDays(v.workweekStart, v.workweekEnd) * 2400
    )
      c.addIssue({
        code: 'custom',
        message: 'Worked hours exceed the calendar hours in this pay period',
      })
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
    payFrequency: z.enum(payrollFrequencies).nullable().optional(),
    grossCents: money.nullable(),
    deductionsCents: money.nullable(),
    netCents: money.nullable(),
    lines: z.array(payrollLineSchema).max(150),
    acknowledgement: z.string().trim().max(2000).nullable(),
    reportedWorkedHundredths: hours.nullable().optional(),
    reportedPaidHundredths: hours.nullable().optional(),
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
