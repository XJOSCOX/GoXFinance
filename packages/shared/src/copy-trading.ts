import { z } from 'zod'
const cents = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const quantity = z
  .string()
  .regex(/^\d{1,6}(?:\.\d{1,4})?$/)
  .refine((v) => Number(v) > 0, 'Quantity must be positive')
export const copyGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    leadAccountId: z.uuid(),
    status: z.enum(['active', 'inactive']),
    members: z
      .array(z.object({ accountId: z.uuid(), quantityMultiplier: quantity }).strict())
      .min(2)
      .max(100),
  })
  .strict()
  .refine(
    (v) => new Set(v.members.map((m) => m.accountId)).size === v.members.length,
    'Select each account once',
  )
  .refine((v) => v.members.some((m) => m.accountId === v.leadAccountId), 'Include the lead account')
export const copyEventSchema = z
  .object({
    groupId: z.uuid(),
    sessionAt: z.iso.datetime(),
    mode: z.enum(['trade', 'daily']),
    instrument: z.string().trim().max(40).nullable(),
    direction: z.enum(['long', 'short']).nullable(),
    notes: z.string().trim().max(4000).nullable(),
    entries: z
      .array(
        z
          .object({
            accountId: z.uuid(),
            quantity,
            grossCents: cents,
            profitCents: cents.nonnegative().nullable().optional(),
            lossCents: cents.nonnegative().nullable().optional(),
            feesIncluded: z.boolean().optional(),
            feesCents: cents.nonnegative(),
          })
          .strict()
          .refine(
            (v) =>
              (v.profitCents == null && v.lossCents == null) ||
              (v.profitCents != null &&
                v.lossCents != null &&
                v.grossCents === v.profitCents - v.lossCents),
            'Enter both profit and loss; gross must equal profit minus loss',
          )
          .refine(
            (v) => !v.feesIncluded || v.feesCents === 0,
            'Fees already included cannot be deducted again',
          )
          .refine((v) => Number.isSafeInteger(v.grossCents - v.feesCents), 'Net amount too large'),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (v) => new Set(v.entries.map((e) => e.accountId)).size === v.entries.length,
    'Select each account once',
  )
export const payoutBatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    requestDate: z.iso.date(),
    notes: z.string().trim().max(4000).nullable(),
    entries: z
      .array(z.object({ accountId: z.uuid(), requestedCents: cents.positive() }).strict())
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (v) => new Set(v.entries.map((e) => e.accountId)).size === v.entries.length,
    'Select each account once',
  )
export type CopyGroupInput = z.infer<typeof copyGroupSchema>
export type CopyGroup = CopyGroupInput & {
  id: string
  householdId: string
  revision: number
  createdAt: string
  updatedAt: string
  canManage: boolean
}
export type CopyEventInput = z.infer<typeof copyEventSchema>
export type CopyEvent = CopyEventInput & {
  id: string
  householdId: string
  revision: number
  createdAt: string
  updatedAt: string
  canManage: boolean
  membershipSnapshot: CopyGroupInput
}
export type PayoutBatch = {
  id: string
  householdId: string
  name: string
  requestDate: string
  notes: string | null
  createdAt: string
}
