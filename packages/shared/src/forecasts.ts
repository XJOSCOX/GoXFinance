import { z } from 'zod'
import type { BillView } from './bills'
import type { Debt } from './debts'
import type { DebtPayment } from './debt-payments'
import type { IncomeData } from './income'
import type { Expense } from './expenses'
import type { FinancialCategory } from './categories'
import type { SettlementOffer } from './debt-planning'
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const forecastInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    startDate: z.iso.date().refine((v) => v.slice(0, 4) >= '1900' && v.slice(0, 4) <= '9998'),
    endDate: z.iso.date().refine((v) => v.slice(0, 4) >= '1900' && v.slice(0, 4) <= '9998'),
    startingCents: z
      .number()
      .int()
      .min(-Number.MAX_SAFE_INTEGER)
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    confidence: z.enum(['unverified', 'estimated', 'confirmed']),
    mode: z.enum(['conservative', 'expected', 'optimistic', 'custom']),
    income: z
      .array(
        z
          .object({
            sourceId: z.uuid(),
            firstPayDate: z.iso.date(),
            conservativeNetCents: cents.nullable(),
            expectedNetCents: cents.nullable(),
            optimisticNetCents: cents.nullable(),
            regularHours: z
              .string()
              .regex(/^\d{1,4}(?:\.\d{1,2})?$/)
              .nullable(),
            overtimeHours: z
              .string()
              .regex(/^\d{1,4}(?:\.\d{1,2})?$/)
              .nullable(),
          })
          .strict(),
      )
      .max(100)
      .refine(
        (a) => new Set(a.map((r) => r.sourceId)).size === a.length,
        'Choose each income source once',
      ),
    variableSpendingCents: cents,
    extraDebtCents: cents,
    includeSettlements: z.boolean(),
    includeUncertainPayouts: z.boolean(),
    oneTime: z
      .array(
        z
          .object({
            id: z.uuid(),
            name: z.string().trim().min(1).max(160),
            date: z.iso.date(),
            kind: z.enum(['income', 'expense', 'uncertain_payout']),
            amountCents: cents,
          })
          .strict(),
      )
      .max(100)
      .refine(
        (a) => new Set(a.map((r) => r.id)).size === a.length,
        'Choose each scenario item once',
      ),
  })
  .strict()
  .superRefine((v, ctx) => {
    const days = (Date.parse(v.endDate) - Date.parse(v.startDate)) / 86400000
    if (days < 0 || days > 365)
      ctx.addIssue({ code: 'custom', message: 'Choose a forecast range of 1–366 days' })
  })
export type ForecastInput = z.infer<typeof forecastInputSchema>
export type ForecastSources = {
  refunds?: import('./bank-review').FinancialRefund[]
  bills: BillView[]
  debts: Debt[]
  payments: DebtPayment[]
  income: IncomeData
  expenses: Expense[]
  categories: FinancialCategory[]
  offers: SettlementOffer[]
  budgets?: import('./budgets').Budget[]
}
export type ForecastEvent = {
  id: string
  date: string
  name: string
  amountCents: number | null
  direction: 'in' | 'out'
  kind:
    | 'refund'
    | 'confirmed_income'
    | 'expected_income'
    | 'purchase'
    | 'debt_repayment'
    | 'bill'
    | 'pending'
    | 'scheduled'
    | 'settlement'
    | 'scenario'
    | 'uncertain_payout'
  estimated: boolean
  grossCents?: number | null
  spendingCents?: number
}
export type ForecastReport = {
  events: ForecastEvent[]
  warnings: string[]
  days: {
    date: string
    netChangeCents: number
    cashCents: number | null
    knownSubtotalCents: number | null
  }[]
  incomeCents: number
  outflowCents: number
  spendingCents: number
  netChangeCents: number
  endingCents: number | null
  lowestCents: number | null
  shortfalls: { date: string; amountCents: number; payments: string[] }[]
  incomplete: boolean
}
export type ForecastData = {
  sources: ForecastSources
  fingerprint: string
  canSave: boolean
  scenarios: { id: string; input: ForecastInput; report: ForecastReport; createdAt: string }[]
}
