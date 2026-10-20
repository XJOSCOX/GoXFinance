import { z } from 'zod'
import type { BankTransactionInput } from './banking'
export const manualImportSchema = z
  .object({
    accountId: z.uuid(),
    format: z.enum(['csv', 'ofx']),
    text: z.string().min(1).max(500000),
    dateFormat: z.enum(['iso', 'mdy', 'dmy']),
    sign: z.enum(['inflow_positive', 'outflow_positive']),
    mapping: z
      .object({
        date: z.string().max(80),
        amount: z.string().max(80),
        debit: z.string().max(80),
        credit: z.string().max(80),
        description: z.string().max(80),
        merchant: z.string().max(80),
        pending: z.string().max(80),
        currency: z.string().max(80),
        reference: z.string().max(80),
      })
      .strict(),
  })
  .strict()
export type ManualImportInput = z.infer<typeof manualImportSchema>
export type ImportPreview = {
  hash: string
  accountRevision: number
  rows: {
    index: number
    values: BankTransactionInput | null
    duplicate: boolean
    possibleDuplicate: boolean
    error: string | null
  }[]
  validCount: number
  invalidCount: number
  duplicateCount: number
  possibleDuplicateCount: number
}
export const confirmManualImportSchema = z
  .object({
    input: manualImportSchema,
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    selectedRows: z
      .array(z.number().int().min(0).max(4999))
      .min(1)
      .max(5000)
      .refine((a) => new Set(a).size === a.length, 'Select each row once'),
    confirmPossibleDuplicates: z.boolean(),
    idempotencyKey: z.uuid(),
  })
  .strict()
export function normalizeBankMerchant(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
export function bankSuggestion(
  merchant: string | null,
  description: string,
  amountCents: number,
  creditAccount: boolean,
) {
  const name = normalizeBankMerchant((merchant ?? '') + ' ' + description)
  if (/\b(refund|reversal|returned purchase)\b/.test(name) && amountCents > 0)
    return {
      classification: 'refund',
      category: null,
      reason: 'Description mentions a refund; select the original record before approval.',
    }
  if (/\b(transfer|payment thank you|card payment)\b/.test(name))
    return {
      classification: 'transfer',
      category: null,
      reason: 'Description suggests a transfer or card repayment; verify the other account leg.',
    }
  if (!creditAccount && amountCents > 0 && /\b(payroll|direct deposit|salary)\b/.test(name))
    return {
      classification: 'income',
      category: null,
      reason: 'A deposit description mentions payroll; check for an existing paycheck.',
    }
  if (amountCents < 0) {
    for (const [pattern, category] of [
      [/austin energy|electric|utility/, 'Utilities'],
      [/walmart|grocery|supermarket/, 'Groceries'],
      [/restaurant|dining|takeout/, 'Food & Dining'],
    ] as const)
      if (pattern.test(name))
        return {
          classification: 'expense',
          category,
          reason:
            'Merchant/description keyword suggests ' +
            category +
            '; this is not an accounting entry.',
        }
  }
  return {
    classification: null,
    category: null,
    reason: 'No reliable classification. Review the transaction and account type.',
  }
}
