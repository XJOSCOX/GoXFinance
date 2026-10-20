import { z } from 'zod'
const cents = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
export const bankAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    institution: z.string().trim().min(1).max(160),
    type: z.enum(['checking', 'savings', 'credit_card', 'other_depository']),
    subtype: z.string().trim().max(60).nullable(),
    mask: z
      .string()
      .regex(/^\d{1,4}$/, 'Use only the last four digits')
      .nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    memberIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((v) => new Set(v).size === v.length, 'Select each member once'),
    status: z.enum(['active', 'hidden']),
    assetId: z.uuid().nullable(),
    debtId: z.uuid().nullable(),
  })
  .strict()
export const bankBalanceSchema = z
  .object({
    currentCents: cents.nullable(),
    availableCents: cents.nullable(),
    observedAt: z.iso.datetime(),
    notes: z.string().trim().max(500).nullable(),
  })
  .strict()
export type BankAccountInput = z.infer<typeof bankAccountSchema>
export type BankBalance = z.infer<typeof bankBalanceSchema> & {
  id: string
  source: 'manual' | 'plaid_cached'
  institutionAsOf: string | null
  createdAt: string
}
export type BankAccount = BankAccountInput & {
  id: string
  householdId: string
  connectionId: string | null
  revision: number
  createdAt: string
  updatedAt: string
  connectionStatus: string
  lastSyncAt: string | null
  balance: BankBalance | null
  canManage: boolean
}
export type BankConnection = {
  id: string
  institution: string
  environment: 'sandbox' | 'production'
  status: string
  errorCode: string | null
  lastSyncAt: string | null
  revision: number
}
export type BankingData = {
  accounts: BankAccount[]
  connections: BankConnection[]
  members: { id: string; name: string }[]
  owner: boolean
  unreviewed: number
  reconciled: number
  unmatchedInflows: number
  unmatchedOutflows: number
}
export const bankTransactionSchema = z
  .object({
    date: z.iso.date(),
    authorizedDate: z.iso.date().nullable(),
    amountCents: cents.refine((v) => v !== 0, 'A transaction amount cannot be zero'),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    pending: z.boolean(),
    merchant: z.string().trim().max(200).nullable(),
    description: z.string().trim().min(1).max(1000),
    externalId: z.string().trim().max(200).nullable(),
  })
  .strict()
export type BankTransactionInput = z.infer<typeof bankTransactionSchema>
export type BankTransaction = Omit<BankTransactionInput, 'externalId'> & {
  id: string
  householdId: string
  accountId: string
  source: 'csv' | 'ofx' | 'plaid'
  revision: number
  reviewStatus: 'unreviewed' | 'reconciled' | 'ignored' | 'needs_review' | 'superseded'
  removed: boolean
  replacedById: string | null
  createdAt: string
  updatedAt: string
}
export type BankClassification =
  'expense' | 'bill_payment' | 'debt_payment' | 'income' | 'transfer' | 'refund' | 'fee' | 'ignore'
export type BankAudit = {
  id: string
  actorUserId: string
  action: string
  targetId: string
  detailsJson: string
  createdAt: string
}
export type BankInbox = {
  transactions: BankTransaction[]
  accounts: BankAccount[]
  canReview: boolean
  owner: boolean
  requests: {
    id: string
    transactionId: string
    status: string
    proposal: unknown
    proposedBy: string
    createdAt: string
  }[]
}
/** Provider decimal amounts must be exact minor units; never silently round source data. */
export function bankDecimalCents(value: string | number) {
  const text = String(value).trim().replaceAll(',', '').replace(/^\$/, '')
  if (!/^-?\d{1,15}(?:\.\d{1,2})?$/.test(text))
    throw new Error('Use a monetary amount with at most two decimal places')
  const negative = text.startsWith('-'),
    [whole, fraction = ''] = text.replace(/^-/, '').split('.')
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')),
    result = Number(negative ? -amount : amount)
  if (!Number.isSafeInteger(result)) throw new Error('Amount exceeds the supported range')
  return result
}
