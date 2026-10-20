import { z } from 'zod'
import { tradingRuleSchema } from './trading'
const money = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
export const promoteCombineSchema = z
  .object({
    sourceRevision: z.number().int().positive(),
    confirmedPassed: z.literal(true),
    nickname: z.string().trim().min(1).max(120),
    maskedExternalId: z
      .string()
      .trim()
      .regex(/^[*xX -]*[A-Za-z0-9]{1,4}$/)
      .nullable(),
    xfaPath: z.enum(['standard', 'consistency']),
    activationDate: z.iso.date().nullable(),
    reportedBalanceCents: money.nullable(),
    maximumLossCents: money.nonnegative().nullable(),
    dailyLossCents: money.nonnegative().nullable(),
    notes: z.string().trim().max(4000).nullable(),
    ruleSnapshot: tradingRuleSchema
      .nullable()
      .refine((rule) => !rule?.supersedesRuleId, 'Use a new XFA rule snapshot'),
  })
  .strict()
