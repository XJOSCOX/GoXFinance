import type { IncomeSource, IncomeTransaction, IncomeTransactionInput } from '@goxfinance/shared'
import { localBillDate, upcomingPayday } from '@goxfinance/shared'
export function initialIncome(
  source?: IncomeSource,
  existing?: IncomeTransaction,
  date?: string,
): IncomeTransactionInput {
  if (existing) return { ...existing, receiptConfirmed: false }
  return {
    sourceId: source?.id ?? '',
    workPeriodStart: null,
    workPeriodEnd: null,
    regularHours: null,
    overtimeHours: null,
    hourlyRateCents: source?.hourlyRateCents ?? null,
    overtimeMultiplier: source?.overtimeMultiplier ?? '1',
    expectedGrossCents: source?.expectedGrossCents ?? null,
    expectedNetCents: source?.expectedNetCents ?? null,
    actualGrossCents: null,
    deductionsCents: null,
    actualNetCents: null,
    payDate: date ?? (source ? upcomingPayday(source, localBillDate()) : null) ?? localBillDate(),
    depositDate: null,
    status: 'pending',
    reference: null,
    notes: null,
    receiptConfirmed: false,
    tradingPayoutWithdrawn: false,
  }
}
export type IncomeUpdater = <K extends keyof IncomeTransactionInput>(
  key: K,
  value: IncomeTransactionInput[K],
) => void
export const incomeMoneyFields = [
  'hourlyRateCents',
  'expectedGrossCents',
  'expectedNetCents',
  'actualGrossCents',
  'deductionsCents',
  'actualNetCents',
] as const
export type IncomeMoney = Record<(typeof incomeMoneyFields)[number], string>
