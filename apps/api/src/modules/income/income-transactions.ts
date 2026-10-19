import {
  incomeTransactionSchema,
  estimatedHourlyGross,
  localBillDate,
  type IncomeTransactionInput,
} from '@goxfinance/shared'
import { FinancialError } from '../households/financial-access'
import type { IncomeRepository, SourceRow, TransactionRow } from './income.repository'

export function transactionValues(
  store: IncomeRepository,
  home: string,
  source: SourceRow,
  raw: IncomeTransactionInput,
  existing?: TransactionRow,
) {
  const values = incomeTransactionSchema.parse(raw)
  const type = existing?.incomeTypeSnapshot ?? source.incomeType
  if (values.status === 'confirmed' && values.depositDate! > localBillDate())
    throw new FinancialError('A future deposit cannot be confirmed as received', 400)
  if (values.status === 'confirmed' && type === 'trading_payout' && !values.tradingPayoutWithdrawn)
    throw new FinancialError(
      'Confirm that this trading payout was actually withdrawn and received',
      400,
    )
  if (existing && values.sourceId !== existing.sourceId)
    throw new FinancialError('A paycheck cannot be moved to another source', 400)
  const frequency = existing?.frequencySnapshot ?? source.frequency
  const paycheckKey = values.workPeriodStart
    ? `${values.workPeriodStart}:${values.workPeriodEnd}`
    : frequency === 'irregular' && values.reference
      ? `reference:${values.reference}`
      : values.payDate
  const regularPayDate = frequency === 'irregular' ? null : values.payDate
  if (
    values.status !== 'cancelled' &&
    store
      .transactions(home)
      .some(
        (v) =>
          v.id !== existing?.id &&
          v.sourceId === source.id &&
          v.status !== 'cancelled' &&
          (v.paycheckKey === paycheckKey ||
            (regularPayDate && v.regularPayDate === regularPayDate) ||
            (values.reference && values.reference === v.reference)),
      )
  )
    throw new FinancialError(
      'This paycheck or reference already exists. Correct the existing entry instead.',
      409,
    )
  let estimatedGrossCents: number | null
  try {
    estimatedGrossCents =
      type === 'hourly'
        ? estimatedHourlyGross(
            values.hourlyRateCents,
            values.regularHours,
            values.overtimeHours,
            values.overtimeMultiplier,
          )
        : values.expectedGrossCents
  } catch {
    throw new FinancialError('Gross estimate exceeds the supported range', 400)
  }
  return {
    ...values,
    responsibleMemberId: existing?.responsibleMemberId ?? source.responsibleMemberId,
    incomeTypeSnapshot: type,
    frequencySnapshot: frequency,
    paycheckKey,
    regularPayDate,
    estimatedGrossCents,
    confirmedAt:
      values.status === 'confirmed'
        ? (existing?.confirmedAt ?? new Date().toISOString())
        : (existing?.confirmedAt ?? null),
  }
}
