import { expect, it } from 'vitest'
import { incomePaycheckStatistics } from './income-paycheck-statistics'
import type { IncomeTransaction } from './income'
const paycheck = (values: Partial<IncomeTransaction> = {}): IncomeTransaction =>
  ({
    id: crypto.randomUUID(),
    sourceId: 'job',
    frequencySnapshot: 'weekly',
    status: 'confirmed',
    actualNetCents: 42348,
    depositDate: '2026-09-24',
    ...values,
  }) as IncomeTransaction
it('shows one historical weekly paycheck without extrapolating or diluting it into missing weeks', () => {
  const result = incomePaycheckStatistics([paycheck()], '2026-10-20')
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({ frequency: 'weekly', count: 1, averageNetCents: null })
  expect(result[0].latest.actualNetCents).toBe(42348)
})
it('averages only recorded net deposits despite gaps, including confirmed zero pay', () => {
  const result = incomePaycheckStatistics(
    [
      paycheck(),
      paycheck({ depositDate: '2026-10-15', actualNetCents: 60000 }),
      paycheck({ depositDate: '2026-10-16', actualNetCents: 0 }),
    ],
    '2026-10-20',
  )
  expect(result[0].count).toBe(3)
  expect(result[0].averageNetCents).toBe(34116)
})
it('separates employers and historical pay frequencies', () => {
  const result = incomePaycheckStatistics(
    [
      paycheck(),
      paycheck({ frequencySnapshot: 'biweekly' }),
      paycheck({ frequencySnapshot: 'semimonthly' }),
      paycheck({ frequencySnapshot: 'monthly' }),
      paycheck({ sourceId: 'second job' }),
    ],
    '2026-10-20',
  )
  expect(result).toHaveLength(5)
  expect(result.every((g) => g.count === 1 && g.averageNetCents === null)).toBe(true)
})
it('excludes pending, expected, cancelled, unknown and future deposits', () => {
  expect(
    incomePaycheckStatistics(
      [
        paycheck({ status: 'pending' }),
        paycheck({ status: 'expected' }),
        paycheck({ status: 'cancelled' }),
        paycheck({ actualNetCents: null }),
        paycheck({ depositDate: null }),
        paycheck({ depositDate: '2026-11-01' }),
      ],
      '2026-10-20',
    ),
  ).toEqual([])
})
