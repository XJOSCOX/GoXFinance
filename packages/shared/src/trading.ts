import type { CopyGroup, CopyEvent, PayoutBatch } from './copy-trading'
import { z } from 'zod'
const money = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const positive = money.nonnegative()
export const tradingTimezone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value })
      return true
    } catch {
      return false
    }
  }, 'Use a valid IANA timezone')
export const tradingRuleSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    effectiveDate: z.iso.date(),
    minimumDays: z.number().int().nonnegative().max(365).nullable(),
    minimumNetCents: positive.nullable(),
    maximumPayoutCents: positive.nullable(),
    profitShareBps: z.number().int().min(0).max(10000).nullable(),
    notes: z.string().trim().max(2000).nullable(),
    version: z.literal(2).optional(),
    profitTargetCents: positive.nullable().optional(),
    combineConsistencyBps: z.number().int().min(0).max(10000).nullable().optional(),
    payoutConsistencyBps: z.number().int().min(0).max(10000).nullable().optional(),
    minimumWinningDayCents: positive.nullable().optional(),
    minimumTradesPerDay: z.number().int().nonnegative().max(100000).nullable().optional(),
    maximumMiniContracts: z.number().int().nonnegative().max(100000).nullable().optional(),
    maximumMicroContracts: z.number().int().nonnegative().max(100000).nullable().optional(),
    monthlyFeeCents: positive.nullable().optional(),
    resetFeeCents: positive.nullable().optional(),
    activationFeeCents: positive.nullable().optional(),
    maintainBalanceBetweenPayouts: z.boolean().nullable().optional(),
    resetCreditOnRebill: z.boolean().nullable().optional(),
    enhancedPayoutCap: z.boolean().nullable().optional(),
  })
  .strict()
export type TradingRule = z.infer<typeof tradingRuleSchema>
export const tradingAccountSchema = z
  .object({
    responsibleMemberId: z.uuid(),
    provider: z.literal('Topstep'),
    nickname: z.string().trim().min(1).max(120),
    maskedExternalId: z
      .string()
      .trim()
      .regex(/^[*xX -]*[A-Za-z0-9]{1,4}$/, 'Enter only the last four characters, optionally masked')
      .nullable(),
    stage: z.enum(['combine', 'xfa', 'lfa']),
    xfaPath: z.enum(['standard', 'consistency', 'not_applicable']),
    tierCents: positive.nullable(),
    reportedBalanceCents: money.nullable(),
    maximumLossCents: positive.nullable(),
    dailyLossCents: positive.nullable(),
    activationDate: z.iso.date().nullable(),
    status: z.enum(['active', 'passed', 'failed', 'closed', 'paused']),
    timezone: tradingTimezone,
    sessionStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    notes: z.string().trim().max(4000).nullable(),
    ruleSnapshot: tradingRuleSchema.nullable(),
  })
  .strict()
  .refine(
    (v) => v.stage === 'xfa' || v.xfaPath === 'not_applicable',
    'XFA paths apply only to XFA accounts',
  )
export const tradingResultSchema = z
  .object({
    accountId: z.uuid(),
    sessionAt: z.iso.datetime(),
    grossCents: money,
    feesCents: positive,
    tradeCount: z.number().int().nonnegative().max(100000).nullable(),
    notes: z.string().trim().max(4000).nullable(),
  })
  .strict()
  .refine(
    (v) => Number.isSafeInteger(v.grossCents - v.feesCents),
    'Net P&L exceeds the supported range',
  )
export const tradingPayoutSchema = z
  .object({
    accountId: z.uuid(),
    requestedCents: positive.positive(),
    requestDate: z.iso.date(),
    status: z.enum(['requested', 'approved', 'rejected', 'paid', 'cancelled']),
    approvedCents: positive.nullable(),
    receivedCents: positive.nullable(),
    depositDate: z.iso.date().nullable(),
    reference: z.string().trim().min(1).max(120).nullable(),
    notes: z.string().trim().max(4000).nullable(),
    receiptConfirmed: z.boolean(),
    existingIncomeTransactionId: z.uuid().nullable(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.status === 'paid' && (!v.receiptConfirmed || v.receivedCents === null || !v.depositDate))
      c.addIssue({ code: 'custom', message: 'Confirm the actual received amount and deposit date' })
    if (
      v.status !== 'paid' &&
      (v.receivedCents !== null ||
        v.depositDate !== null ||
        v.existingIncomeTransactionId !== null ||
        v.receiptConfirmed)
    )
      c.addIssue({
        code: 'custom',
        message: 'Receipt and income linking are allowed only for paid payouts',
      })
    if (v.depositDate && v.depositDate < v.requestDate)
      c.addIssue({ code: 'custom', message: 'Deposit cannot precede the payout request' })
  })
export const createTradingSchema = <T extends z.ZodType>(values: T) =>
  z.object({ idempotencyKey: z.uuid(), values }).strict()
export const editTradingSchema = <T extends z.ZodType>(values: T) =>
  z
    .object({
      revision: z.number().int().positive(),
      reason: z.string().trim().min(1).max(2000),
      values,
    })
    .strict()
export type TradingAccountInput = z.infer<typeof tradingAccountSchema>
export type TradingResultInput = z.infer<typeof tradingResultSchema>
export type TradingPayoutInput = z.infer<typeof tradingPayoutSchema>
export type TradingAccount = Omit<TradingAccountInput, 'ruleSnapshot'> & {
  id: string
  householdId: string
  revision: number
  createdAt: string
  updatedAt: string
  canManage: boolean
  incomeSourceId: string | null
  deletedAt: string | null
  ruleSnapshots: (z.infer<typeof tradingRuleSchema> & { id: string; createdAt: string })[]
}
export type TradingResult = TradingResultInput & {
  id: string
  householdId: string
  sessionDate: string
  copyEventId?: string
  timezone: string
  sessionStart: string
  netCents: number
  revision: number
  createdAt: string
  updatedAt: string
  canManage: boolean
}
export type TradingPayout = TradingPayoutInput & {
  id: string
  householdId: string
  incomeTransactionId: string | null
  revision: number
  createdAt: string
  updatedAt: string
  canManage: boolean
}
export type FinancialAudit = {
  id: string
  actorUserId: string
  action: string
  targetId: string
  beforeJson: string | null
  afterJson: string | null
  createdAt: string
}
export type TradingData = {
  groups: CopyGroup[]
  events: CopyEvent[]
  batches: PayoutBatch[]
  accounts: TradingAccount[]
  results: TradingResult[]
  payouts: TradingPayout[]
  canCreate: boolean
}
