import { z } from 'zod'
import type { ForecastSources, ForecastReport, ForecastInput } from './forecasts'
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const nullableId = z.uuid().nullable().default(null)
export const plannerTargetSchema = z
  .object({
    kind: z.enum(['bill', 'bill_period', 'debt', 'expense', 'goal', 'settlement']),
    id: z.uuid(),
    parentId: nullableId,
  })
  .strict()
export type PlannerTarget = z.infer<typeof plannerTargetSchema>
export const plannerVerificationSchema = z
  .object({
    verified: z.boolean().default(false),
    source: z.string().trim().max(1000).default(''),
    verifiedAt: z.iso.datetime().nullable().default(null),
    validThrough: z.iso.date().nullable().default(null),
  })
  .strict()
export const plannerPriorities = [
  'critical',
  'essential',
  'important',
  'flexible',
  'optional',
] as const
const common = {
  name: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(4000).default(''),
}
const paymentLink = z.object({ kind: z.enum(['bill', 'debt']), id: z.uuid() }).strict()
const installment = z
  .object({
    id: z.uuid(),
    date: z.iso.date(),
    principalCents: cents,
    feesCents: cents.default(0),
    interestCents: cents.default(0),
    payments: z.array(paymentLink).max(100).default([]),
  })
  .strict()
export const plannerInputSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        ...common,
        kind: z.literal('debt_plan'),
        target: plannerTargetSchema,
        mode: z.enum(['pay_by_date', 'linked_bill']),
        amountCents: cents.nullable(),
        startDate: z.iso.date(),
        deadline: z.iso.date(),
        billId: nullableId,
        billUpdatedAt: z.string().nullable().default(null),
        amountBasis: z.enum(['balance', 'settlement', 'custom']),
        settlementId: nullableId,
        settlementRevision: z.number().int().positive().nullable().default(null),
        replaceOriginal: z.boolean().default(false),
        verification: plannerVerificationSchema,
        status: z.enum(['draft', 'confirmed', 'cancelled']),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('priority'),
        target: plannerTargetSchema,
        priority: z.enum(plannerPriorities),
        essential: z.boolean().default(false),
        legalOrder: z.boolean().default(false),
        consequence: z
          .enum([
            'none',
            'housing',
            'disconnection',
            'repossession',
            'judgment',
            'health',
            'employment',
          ])
          .default('none'),
        deadline: z.iso.date().nullable().default(null),
        graceDays: z.number().int().min(0).max(90).nullable().default(null),
        lateFeeCents: cents.nullable().default(null),
        partialAllowed: z.enum(['unknown', 'verified', 'not_allowed']).default('unknown'),
        verification: plannerVerificationSchema,
        paymentAccountId: nullableId,
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('arrangement'),
        target: plannerTargetSchema,
        arrangementType: z.enum(['split', 'bnpl']),
        provider: z.string().trim().min(1).max(160),
        originalCents: cents,
        financedCents: cents,
        downPaymentCents: cents.default(0),
        expenseId: nullableId,
        status: z.enum(['proposed', 'accepted', 'active', 'completed', 'cancelled', 'defaulted']),
        verification: plannerVerificationSchema,
        replacesOriginal: z.boolean(),
        coverageStart: z.iso.date(),
        coverageEnd: z.iso.date(),
        installments: z.array(installment).min(1).max(360),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('advance'),
        target: plannerTargetSchema,
        provider: z.string().trim().min(1).max(160),
        advanceType: z.enum(['loan', 'earned_wage', 'employer']),
        principalCents: cents,
        receivedCents: cents,
        receivedDate: z.iso.date(),
        received: z.boolean(),
        feesCents: cents.default(0),
        tipsCents: cents.default(0),
        expeditedCents: cents.default(0),
        feeCollection: z.enum(['withheld', 'repayment']),
        repaymentCents: cents,
        repaymentDate: z.iso.date(),
        repaymentMethod: z.enum(['bank_debit', 'payroll_deduction']),
        payrollRepaidCents: cents.default(0),
        autoDebit: z.boolean(),
        sourceId: nullableId,
        payrollWeekId: nullableId,
        deductionTreatment: z.enum(['included', 'subtract_forecast', 'unknown']),
        verification: plannerVerificationSchema,
        status: z.enum(['proposed', 'active', 'completed', 'cancelled']),
        payments: z.array(paymentLink).max(100).default([]),
        accountId: nullableId,
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('allocation'),
        target: plannerTargetSchema.nullable(),
        categoryId: nullableId,
        goalId: nullableId,
        purpose: z.enum([
          'obligation',
          'essential_reserve',
          'sinking_fund',
          'emergency',
          'savings',
          'extra_debt',
        ]),
        amountCents: cents,
        date: z.iso.date(),
        fundingEventId: z.string().max(200).nullable().default(null),
        accountId: nullableId,
        status: z.enum(['accepted', 'dismissed']),
        priority: z.enum(plannerPriorities),
        explanation: z.string().trim().min(1).max(2000),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('preferences'),
        essentialReserveCents: cents,
        accountIds: z.array(z.uuid()).max(100),
        useBudgetReserves: z.boolean().default(false),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('balance'),
        accountId: z.uuid(),
        balanceId: z.uuid(),
        effectiveAt: z.iso.datetime(),
        timezone: z.string().min(1).max(80),
        source: z.enum(['user_reported', 'reconciled', 'verified_connected']),
        verification: plannerVerificationSchema,
        pendingIncluded: z.enum(['yes', 'no', 'unknown']),
        includedPending: z
          .array(z.object({ eventId: z.string().max(200), amountCents: cents }).strict())
          .max(300),
      })
      .strict(),
  ])
  .superRefine((v, c) => {
    const issue = (message: string) => c.addIssue({ code: 'custom', message })
    if (v.kind === 'debt_plan') {
      if (v.target.kind !== 'debt') issue('Choose an existing debt for this payment goal.')
      if (v.deadline < v.startDate) issue('Deadline cannot precede the plan start date.')
      if (v.mode === 'linked_bill' && !v.billId) issue('Select the existing linked monthly bill.')
      if (v.mode === 'pay_by_date' && v.status === 'confirmed' && !v.amountCents)
        issue('Confirm a positive planned payment amount before including the goal.')
      if (v.mode === 'pay_by_date' && v.billId)
        issue('A dated payoff goal does not select a monthly bill.')
      if (v.replaceOriginal && v.status === 'confirmed' && !v.verification.verified)
        issue('Replacing the original schedule requires verified provider terms.')
      if (v.amountBasis === 'settlement' && !v.settlementId)
        issue('Record and select the settlement offer first.')
    }
    if (
      'verification' in v &&
      v.verification.verified &&
      (!v.verification.source || !v.verification.verifiedAt)
    )
      issue('Verified terms need a source and verification timestamp.')
    if (
      v.kind === 'priority' &&
      (v.legalOrder ||
        v.consequence !== 'none' ||
        v.graceDays !== null ||
        v.partialAllowed === 'verified') &&
      !v.verification.verified
    )
      issue(
        'Serious consequences, grace periods and accepted partial payments require verified terms.',
      )
    if (v.kind === 'arrangement') {
      if (!['bill_period', 'debt'].includes(v.target.kind))
        issue('Link an arrangement to an existing bill period or debt.')
      if (v.coverageEnd < v.coverageStart) issue('Coverage end must follow its start.')
      if (BigInt(v.financedCents) + BigInt(v.downPaymentCents) !== BigInt(v.originalCents))
        issue('Financing plus down payment must equal the original obligation.')
      if (new Set(v.installments.map((i) => i.id)).size !== v.installments.length)
        issue('Installment IDs must be unique.')
      if (v.installments.some((i) => i.date < v.coverageStart || i.date > v.coverageEnd))
        issue('Installments must fall inside the coverage dates.')
      if (
        v.installments.reduce((n, i) => n + BigInt(i.principalCents), 0n) !==
        BigInt(v.originalCents)
      )
        issue('Installment principal must equal the original obligation.')
      if (
        v.arrangementType === 'bnpl' &&
        (v.target.kind !== 'debt' ||
          !v.expenseId ||
          BigInt(v.financedCents) + BigInt(v.downPaymentCents) !== BigInt(v.originalCents))
      )
        issue(
          'BNPL needs a debt, purchase expense, and financing plus down payment equal to the purchase.',
        )
      if (
        v.replacesOriginal &&
        ['accepted', 'active', 'completed'].includes(v.status) &&
        !v.verification.verified
      )
        issue('Replacing original due terms requires a verified accepted agreement.')
    }
    if (v.kind === 'advance') {
      if (v.target.kind !== 'debt') issue('Link the advance to its existing debt liability.')
      const cost = BigInt(v.feesCents) + BigInt(v.tipsCents) + BigInt(v.expeditedCents)
      if (
        BigInt(v.repaymentCents) !==
        BigInt(v.principalCents) + (v.feeCollection === 'repayment' ? cost : 0n)
      )
        issue('Repayment must reconcile principal and repayment-collected costs.')
      if (
        v.received &&
        BigInt(v.receivedCents) !==
          BigInt(v.principalCents) - (v.feeCollection === 'withheld' ? cost : 0n)
      )
        issue('Actual receipt must reconcile principal and withheld costs.')
      if (v.repaymentDate < v.receivedDate) issue('Repayment cannot precede receipt.')
      if (
        v.repaymentMethod === 'payroll_deduction' &&
        (!v.sourceId || !v.payrollWeekId || v.advanceType === 'loan')
      )
        issue(
          'Payroll deductions need an employer/earned-wage advance and a linked payroll period.',
        )
      if (v.status !== 'proposed' && v.status !== 'cancelled' && !v.verification.verified)
        issue('Active advances need verified repayment terms.')
    }
    if (v.kind === 'allocation' && v.purpose === 'obligation' && !v.target)
      issue('An obligation allocation needs an existing target.')
    if (v.kind === 'preferences' && new Set(v.accountIds).size !== v.accountIds.length)
      issue('Choose accounts only once.')
  })
export type PlannerInput = z.infer<typeof plannerInputSchema>
export type PlannerRecord = {
  id: string
  householdId: string
  revision: number
  createdByUserId: string
  createdAt: string
  updatedAt: string
  values: PlannerInput
  canManage?: boolean
  requiresApproval?: boolean
}
export type PlannerRequest = {
  id: string
  householdId: string
  actorUserId: string
  targetId: string | null
  revision: number
  values: PlannerInput
  fingerprint: string
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reviewedByUserId: string | null
  reviewedAt: string | null
  createdAt: string
}
export type PlannerSources = { records: PlannerRecord[]; goals?: import('./goals').Goal[] }
export type PlannerFunding = {
  id: string
  name: string
  date: string
  amountCents: number
  accountId: string | null
  status:
    | 'confirmed_cash'
    | 'documented_paycheck'
    | 'forecast_paycheck'
    | 'assumed_paycheck'
    | 'hypothetical_borrowing'
  remainingCents: number
}
export type PlannerItem = {
  id: string
  name: string
  target: PlannerTarget | null
  date: string
  amountCents: number | null
  priority: (typeof plannerPriorities)[number]
  reason: string[]
  consequence: string | null
  partialAllowed: boolean
  accountId: string | null
  sourceEventIds: string[]
  recommendedCents: number
  unfundedCents: number | null
  funding: {
    id: string
    name: string
    date: string
    amountCents: number
    status: PlannerFunding['status']
  }[]
  confidence: 'confirmed' | 'estimated' | 'incomplete'
  dismissed: boolean
}
export type PlannerReport = {
  forecast: ForecastReport
  items: PlannerItem[]
  funding: PlannerFunding[]
  reservedCents: number
  confirmedSpendableCents: number | null
  unfundedCents: number
  unfundedReservesCents?: number
  unfundedCriticalCents: number
  unknownCount: number
  feesCents: number
  warnings: string[]
  insights: { title: string; reason: string; actions: string[] }[]
  patterns: {
    name: string
    amountCents: number | null
    sampleCount: number
    confidence: 'low' | 'medium'
    basis: string
  }[]
  fullyFunded: boolean
  sourcesFingerprint?: string
}
export type PlannerData = {
  sources: ForecastSources
  settings: import('./smart-forecast-settings').ForecastSettingsVersion | null
  fingerprint: string
  canManage: boolean
  records: PlannerRecord[]
  requests: PlannerRequest[]
  snapshots: {
    id: string
    name: string
    input?: ForecastInput
    report: PlannerReport
    createdAt: string
  }[]
  owner: boolean
}
