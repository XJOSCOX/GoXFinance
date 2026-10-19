import { z } from 'zod'
import { tradingAccountSchema, tradingResultSchema, tradingRuleSchema } from './trading'

export const tradingAccountBatchSchema = z
  .array(tradingAccountSchema)
  .min(1)
  .max(20)
  .refine(
    (accounts) => new Set(accounts.map((a) => a.nickname.toLowerCase())).size === accounts.length,
    'Give each new account a different nickname',
  )

export const tradingResultBatchSchema = z
  .array(tradingResultSchema)
  .min(1, 'Select at least one account')
  .max(100)
  .refine(
    (entries) => new Set(entries.map((entry) => entry.accountId)).size === entries.length,
    'Each account can appear only once in a daily result batch',
  )

export const tradingAccountRulesBatchSchema = z
  .array(
    z
      .object({
        accountId: z.uuid(),
        revision: z.number().int().positive(),
        reason: z.string().trim().min(1).max(2000),
        tierCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
        maximumLossCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
        dailyLossCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
        ruleSnapshot: tradingRuleSchema,
      })
      .strict(),
  )
  .min(1)
  .max(100)
  .refine(
    (entries) => new Set(entries.map((e) => e.accountId)).size === entries.length,
    'Select each account only once',
  )
