import { z } from 'zod'
import { tradingAccountSchema, tradingResultSchema } from './trading'

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
