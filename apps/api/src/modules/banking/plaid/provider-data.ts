import { z } from 'zod'
import { bankDecimalCents, bankTransactionSchema } from '@goxfinance/shared'
import type { ProviderAccount, ProviderTransaction } from './plaid.gateway'
import { safeBankText } from '../imports/statement-parser'
const providerId = z.string().min(1).max(200)
export function providerAccount(a: ProviderAccount) {
  providerId.parse(a.id)
  const type =
    a.type === 'credit' && a.subtype === 'credit card'
      ? 'credit_card'
      : a.type === 'depository'
        ? a.subtype === 'checking' || a.subtype === 'savings'
          ? a.subtype
          : 'other_depository'
        : null
  if (!type) return null
  return {
    id: a.id,
    type,
    name: safeBankText(z.string().min(1).max(120).parse(a.name)),
    subtype: z.string().max(60).nullable().parse(a.subtype),
    mask: a.mask && /^\d{1,4}$/.test(a.mask) ? a.mask : null,
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .parse(a.currency),
    currentCents: a.current === null ? null : bankDecimalCents(a.current),
    availableCents: a.available === null ? null : bankDecimalCents(a.available),
  }
}
export function providerTransaction(t: ProviderTransaction) {
  return {
    id: providerId.parse(t.id),
    accountId: providerId.parse(t.accountId),
    pendingId: providerId.nullable().parse(t.pendingId),
    values: bankTransactionSchema.parse({
      date: t.date,
      authorizedDate: t.authorizedDate,
      amountCents: -bankDecimalCents(t.amount),
      currency: t.currency,
      pending: t.pending,
      merchant: t.merchant ? safeBankText(t.merchant) : null,
      description: safeBankText(t.description),
      externalId: null,
    }),
  }
}
