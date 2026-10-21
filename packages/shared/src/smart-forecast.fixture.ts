import type { ForecastSources, ForecastInput } from './forecasts'
import type { PayrollWeek } from './payroll'
import type { IncomeSource, IncomeTransaction } from './income'
import { smartForecastInput } from './smart-forecast'

export const smartSources = (): ForecastSources => ({
  bills: [],
  debts: [],
  payments: [],
  expenses: [],
  categories: [],
  offers: [],
  payroll: [],
  income: { sources: [], transactions: [], canCreate: true },
})
export const smartInput = (amountCents: number | null = 100000): ForecastInput => {
  const input = smartForecastInput(null, '2026-10-20', 30)
  input.smart!.opening =
    amountCents === null
      ? null
      : {
          amountCents,
          effectiveAt: '2026-10-20T08:00:00-05:00',
          effectiveDate: '2026-10-20',
          source: 'user_confirmed',
          confidence: 'confirmed',
          confirmed: true,
          accounts: [],
          includedActivityIds: [],
        }
  return input
}
export const smartSource = (frequency: IncomeSource['frequency'] = 'weekly') =>
  ({
    id: 'source',
    name: 'Fictional employer',
    incomeType: 'hourly',
    status: 'active',
    isArchived: false,
    frequency,
  }) as IncomeSource
export const smartWeek = (changes: Partial<PayrollWeek> = {}): PayrollWeek =>
  ({
    id: 'week',
    sourceId: 'source',
    workweekStart: '2026-10-12',
    workweekEnd: '2026-10-18',
    expectedPayDate: '2026-10-23',
    incomeTransactionId: null,
    statement: null,
    reviewedAt: null,
    forecasts: [
      {
        id: 'forecast',
        createdAt: '2026-10-19T10:00:00Z',
        modelVersion: 16,
        result: {
          netCents: 80000,
          grossCents: 100000,
          confidence: 'medium',
          explanation: { sampleCount: 5 },
        },
      },
    ],
    ...changes,
  }) as PayrollWeek
export const smartIncome = (changes: Partial<IncomeTransaction> = {}): IncomeTransaction =>
  ({
    id: 'income',
    sourceId: 'source',
    status: 'pending',
    payDate: '2026-10-23',
    depositDate: null,
    actualNetCents: null,
    expectedNetCents: 81000,
    actualGrossCents: null,
    expectedGrossCents: 100000,
    workPeriodStart: '2026-10-12',
    workPeriodEnd: '2026-10-18',
    ...changes,
  }) as IncomeTransaction
