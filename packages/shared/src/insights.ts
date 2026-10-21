import { z } from 'zod'
import type { ForecastSources, ForecastReport, ForecastInput } from './forecasts'
import type { DebtBalanceHistory } from './debt-payments'
import type { AssetSources } from './assets'
export type InsightRef = {
  type:
    | 'expense'
    | 'refund'
    | 'settlement'
    | 'income'
    | 'payroll'
    | 'bill'
    | 'debt'
    | 'debt_payment'
    | 'debt_balance'
    | 'bank_balance'
    | 'forecast_settings'
    | 'budget'
    | 'planner'
    | 'goal'
    | 'asset'
  id: string
  date: string
  parentId?: string
}
export const insightPriorities = ['urgent', 'important', 'improvement', 'informational'] as const
export type Insight = {
  id: string
  area: 'spending' | 'income' | 'debt' | 'cash_flow' | 'savings'
  type: string
  title: string
  explanation: string
  priority: (typeof insightPriorities)[number]
  confidence: 'high' | 'medium' | 'low'
  from: string
  through: string
  sampleCount: number
  method: string
  currentCents: number | null
  comparisonCents: number | null
  changeBps: number | null
  impactCents: number | null
  action: string
  tradeoffs: string[]
  limitations: string[]
  refs: InsightRef[]
  module: string
  categoryId?: string
  reducibleCents?: number
  feedback?: 'useful' | 'dismissed'
  feedbackRevision?: number
}
export type InsightMetric = {
  key: string
  label: string
  value: number | null
  unit: 'cents' | 'bps' | 'days'
  basis: string
  sampleCount: number
  refs: InsightRef[]
}
export type InsightSources = ForecastSources & {
  settingsIds?: string[]
  settingsId?: string
  balances: DebtBalanceHistory[]
  assets?: AssetSources
}
export type InsightReport = {
  schemaVersion: 1
  evaluatedAt: string
  from: string
  through: string
  comparisonFrom: string
  comparisonThrough: string
  privacyLimited: boolean
  status: 'needs_information' | 'pressure' | 'within_observed_plan'
  metrics: InsightMetric[]
  insights: Insight[]
  coverage: string[]
}
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const insightInteractionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('feedback'),
      insightId: z.string().min(1).max(240),
      status: z.enum(['useful', 'dismissed', 'reset']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('plan'),
      insightId: z.string().min(1).max(240),
      status: z.enum(['planned', 'in_progress', 'completed', 'dismissed']),
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      reductionCents: cents.nullable(),
      notes: z.string().trim().max(1000),
    })
    .strict(),
])
export type InsightInteractionInput = z.infer<typeof insightInteractionSchema>
export type InsightPlan = {
  id: string
  revision: number
  values: Extract<InsightInteractionInput, { kind: 'plan' }>
  insight: Insight
  createdAt: string
  stale: boolean
  observedSpendingCents: number | null
  observedCount: number
  achievedSavingsCents: null
  scenario: {
    baseline: Pick<ForecastReport, 'endingCents' | 'lowestCents' | 'incomplete'>
    proposed: Pick<ForecastReport, 'endingCents' | 'lowestCents' | 'incomplete'>
    input: ForecastInput
    improvementCents: number | null
  } | null
}
export type InsightsData = {
  report: InsightReport
  fingerprint: string
  canManage: boolean
  plans: InsightPlan[]
}
export type InsightSink = (insight: Insight) => void
