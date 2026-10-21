import { expect, it } from 'vitest'
import { estimatedHourlyGross, upcomingPayday, incomeSummary } from './income-calculations'
import { incomeTransactionSchema, type IncomeTransaction } from './income'
it('calculates variable hours and configurable overtime in exact decimal units', () => {
  expect(estimatedHourlyGross(2500, '31.25', '0', '1')).toBe(78125)
  expect(estimatedHourlyGross(2500, '27', '4.5', '1.5')).toBe(84375)
  expect(estimatedHourlyGross(2500, '27', '4.5', '1')).toBe(78750)
  expect(estimatedHourlyGross(1234, '0.01', '0.01', '1.125')).toBe(26)
  expect(estimatedHourlyGross(2500, null, null, '1')).toBeNull()
  expect(estimatedHourlyGross(null, '30', null, '1')).toBeNull()
  expect(estimatedHourlyGross(2500, '0', '0', '1')).toBe(0)
  expect(() => estimatedHourlyGross(2500, '2.001', null, '1')).toThrow()
  expect(() => estimatedHourlyGross(Number.MAX_SAFE_INTEGER, '1000', null, '1')).toThrow()
})
it('shows Thursday or configured paydays without creating transactions', () => {
  expect(upcomingPayday({ frequency: 'weekly', payday: 4 }, '2026-10-19')).toBe('2026-10-22')
  expect(upcomingPayday({ frequency: 'weekly', payday: 4 }, '2026-10-22')).toBe('2026-10-22')
  expect(upcomingPayday({ frequency: 'weekly', payday: 4 }, '2026-10-23')).toBe('2026-10-29')
  expect(upcomingPayday({ frequency: 'weekly', payday: 1 }, '2026-10-20')).toBe('2026-10-26')
  expect(upcomingPayday({ frequency: 'irregular', payday: 4 }, '2026-10-19')).toBeNull()
})
it('uses deposit dates, excludes unrecorded weeks from averages, and separates all estimates', () => {
  const base = {
    sourceId: 'source',
    responsibleMemberId: 'person',
    actualNetCents: 70000,
    expectedNetCents: 80000,
  } as IncomeTransaction
  const result = incomeSummary(
    [
      { ...base, status: 'confirmed', depositDate: '2026-10-01' },
      { ...base, status: 'confirmed', depositDate: '2026-10-15' },
      { ...base, status: 'pending', payDate: '2026-10-10' },
      { ...base, status: 'expected', payDate: '2026-10-22' },
      { ...base, status: 'cancelled', depositDate: '2026-10-12' },
      { ...base, status: 'confirmed', depositDate: '2026-12-01' },
    ],
    '2026-10',
    '2026-10-19',
  )
  expect(result.confirmedCents).toBe(140000)
  expect(result.weekCount).toBe(2)
  expect(result.averageWeeklyCents).toBe(70000)
  expect(result.averageMonthlyCents).toBe(140000)
  expect(result.pendingCents).toBe(80000)
  expect(result.expectedCents).toBe(80000)
  expect(result.bySource).toEqual([{ id: 'source', amountCents: 140000 }])
  expect(incomeSummary([], '2026-10', '2026-10-19').averageWeeklyCents).toBeNull()
})
it('requires actual deposits and valid work periods for confirmation', () => {
  const value = {
    sourceId: crypto.randomUUID(),
    workPeriodStart: null,
    workPeriodEnd: null,
    regularHours: null,
    overtimeHours: null,
    hourlyRateCents: null,
    overtimeMultiplier: '1',
    expectedGrossCents: null,
    expectedNetCents: null,
    actualGrossCents: null,
    deductionsCents: null,
    actualNetCents: null,
    payDate: '2026-10-01',
    depositDate: null,
    status: 'pending',
    reference: null,
    notes: null,
    receiptConfirmed: false,
    tradingPayoutWithdrawn: false,
  }
  expect(incomeTransactionSchema.safeParse(value).success).toBe(true)
  expect(incomeTransactionSchema.safeParse({ ...value, status: 'confirmed' }).success).toBe(false)
  expect(
    incomeTransactionSchema.safeParse({
      ...value,
      status: 'confirmed',
      actualNetCents: 0,
      depositDate: '2026-10-01',
      receiptConfirmed: true,
    }).success,
  ).toBe(true)
  expect(
    incomeTransactionSchema.safeParse({
      ...value,
      workPeriodStart: '2026-10-10',
      workPeriodEnd: '2026-10-01',
    }).success,
  ).toBe(false)
  expect(incomeTransactionSchema.safeParse({ ...value, regularHours: '1.234' }).success).toBe(false)
})
