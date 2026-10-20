import { z } from 'zod'
export const plaidLinkSchema = z
  .object({ idempotencyKey: z.uuid(), connectionId: z.uuid().nullable() })
  .strict()
export const plaidExchangeSchema = z
  .object({ attemptId: z.uuid(), publicToken: z.string().min(1).max(1024) })
  .strict()
export type PlaidAvailability = {
  enabled: boolean
  environment: 'sandbox'
  reason: string | null
  reservedItems: number
  itemCap: number
  remainingItems: number
}
export type PlaidLinkSession = {
  attemptId: string
  linkToken: string
  expiresAt: string
  updating: boolean
}
export type BankSyncPreview = {
  previewId: string
  connectionId: string
  added: number
  modified: number
  removed: number
  accounts: number
  expiresAt: string
}
