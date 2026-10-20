import { z } from 'zod'
import type { Debt } from './debts'
import type { DebtBalanceHistory } from './debt-payments'
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const ids = z
  .array(z.uuid())
  .max(100)
  .refine((a) => new Set(a).size === a.length, 'Choose each record once')
export const assetSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    category: z.enum([
      'vehicle',
      'real_estate',
      'cash',
      'checking',
      'savings',
      'brokerage',
      'retirement',
      'business',
      'other',
    ]),
    memberIds: ids.refine((a) => a.length > 0, 'Assign at least one member'),
    debtIds: ids,
    acquisitionDate: z.iso.date().nullable(),
    purchaseCents: cents.nullable(),
    notes: z.string().max(4000).nullable(),
    status: z.enum(['active', 'archived']),
  })
  .strict()
export const valuationSchema = z
  .object({
    valueCents: z
      .number()
      .int()
      .min(-Number.MAX_SAFE_INTEGER)
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    valuationDate: z.iso.date(),
    source: z.string().trim().min(1).max(200),
    confidence: z.enum(['confirmed', 'estimated', 'unverified']),
    notes: z.string().max(4000).nullable(),
    supersedesId: z.uuid().nullable(),
  })
  .strict()
export const createAssetSchema = assetSchema.extend({ valuation: valuationSchema }).strict()
export type AssetInput = z.infer<typeof assetSchema>
export type ValuationInput = z.infer<typeof valuationSchema>
export type Asset = AssetInput & {
  id: string
  householdId: string
  revision: number
  createdAt: string
  updatedAt: string
  canManage: boolean
}
export type AssetValuation = ValuationInput & {
  id: string
  assetId: string
  householdId: string
  createdAt: string
  recordedByUserId: string
}
export type AssetSources = {
  assets: Asset[]
  valuations: AssetValuation[]
  debts: Debt[]
  balances: DebtBalanceHistory[]
}
export type NetWorthReport = {
  asOf: string
  memberId: string | null
  assets: {
    id: string
    name: string
    category: AssetInput['category']
    valueCents: number | null
    valuationDate: string | null
    confidence: string
    equityCents: number | null
  }[]
  liabilities: {
    id: string
    name: string
    balanceCents: number | null
    balanceDate: string | null
  }[]
  assetCents: number
  liabilityCents: number
  subtotalCents: number
  incomplete: boolean
  warnings: string[]
  assetDistribution: { category: string; valueCents: number }[]
  liabilityDistribution: { category: string; valueCents: number }[]
}
export type AssetData = AssetSources & {
  members: { id: string; fullName: string; status: string }[]
  canCreate: boolean
  canCaptureHousehold: boolean
  canCaptureMemberIds: string[]
  fingerprint: string
  snapshots: { id: string; report: NetWorthReport; createdAt: string }[]
}
