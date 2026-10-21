import { z } from 'zod'
const money = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
export const openingCashSchema = z
  .object({
    amountCents: money,
    effectiveAt: z.iso.datetime({ offset: true }),
    effectiveDate: z.iso.date(),
    source: z.enum(['user_confirmed', 'selected_accounts']),
    confidence: z.literal('confirmed'),
    confirmed: z.literal(true),
    accounts: z
      .array(z.object({ accountId: z.uuid(), balanceId: z.uuid(), availableCents: money }).strict())
      .max(100),
    includedActivityIds: z.array(z.string().min(1).max(160)).max(10000),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.effectiveDate !== v.effectiveAt.slice(0, 10))
      c.addIssue({
        code: 'custom',
        message: 'Opening cash date must match its effective timestamp.',
      })
    if (new Set(v.accounts.map((a) => a.accountId)).size !== v.accounts.length)
      c.addIssue({ code: 'custom', message: 'Select each cash account once.' })
    if (v.source === 'selected_accounts' && !v.accounts.length)
      c.addIssue({ code: 'custom', message: 'Select at least one current cash account.' })
    if (v.source === 'user_confirmed' && v.accounts.length)
      c.addIssue({
        code: 'custom',
        message: 'Manual cash and selected account balances cannot be combined.',
      })
  })
export const forecastPreferencesSchema = z
  .object({
    opening: openingCashSchema.nullable(),
    bufferCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
export const smartOptionsSchema = z
  .object({
    opening: openingCashSchema.nullable(),
    bufferCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    settingsVersionId: z.uuid().nullable(),
    incomeAdjustments: z
      .array(
        z
          .object({
            eventId: z.string().min(1).max(200),
            delayDays: z.number().int().min(0).max(5),
            reductionBps: z.number().int().min(0).max(3000),
            excluded: z.boolean(),
          })
          .strict(),
      )
      .max(200),
    postponedPayments: z
      .array(
        z
          .object({
            eventId: z.string().min(1).max(200),
            delayDays: z.number().int().min(1).max(30),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
  .superRefine((v, c) => {
    for (const items of [v.incomeAdjustments, v.postponedPayments])
      if (new Set(items.map((i) => i.eventId)).size !== items.length)
        c.addIssue({ code: 'custom', message: 'Adjust each forecast event once.' })
  })
export type OpeningCash = z.infer<typeof openingCashSchema>
export type ForecastPreferences = z.infer<typeof forecastPreferencesSchema>
export type ForecastSettingsVersion = ForecastPreferences & {
  id: string
  revision: number
  createdAt: string
}
export type SmartOptions = z.infer<typeof smartOptionsSchema>
export type ForecastRisk = {
  id: string
  date: string
  amountCents: number | null
  kind:
    | 'negative'
    | 'buffer'
    | 'before_payday'
    | 'delayed_payroll'
    | 'missing'
    | 'concentration'
    | 'large_outflow'
  reason: string
  confidence: 'confirmed' | 'estimated' | 'incomplete'
  eventIds: string[]
  actions: string[]
}
