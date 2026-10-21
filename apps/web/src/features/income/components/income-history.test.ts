import { expect, it } from 'vitest'
import type { IncomeSource, IncomeTransaction } from '@goxfinance/shared'
import { filterIncomeHistory, incomeHistoryDate } from './income-history'
const sources = [{ id: 'job', name: 'Fictional Payroll' }] as IncomeSource[]
const records = ['2026-09-24', '2026-10-02', '2026-10-09', '2026-10-16'].map(
  (date, i) =>
    ({
      id: String(i),
      sourceId: 'job',
      responsibleMemberId: 'earner',
      status: 'confirmed',
      depositDate: date,
      payDate: date,
    }) as IncomeTransaction,
)
it('shows all four uploaded paychecks across months by default', () => {
  expect(filterIncomeHistory(records, sources)).toHaveLength(4)
  expect(filterIncomeHistory(records, sources, { month: '' })).toHaveLength(4)
  expect(filterIncomeHistory(records, sources, { month: '2026-10' })).toHaveLength(3)
  expect(filterIncomeHistory(records, sources, { month: '2026-09' })).toHaveLength(1)
})
it('uses confirmed deposit dates and pending printed dates without losing records', () => {
  const changed = [
    { ...records[0], payDate: '2026-09-30', depositDate: '2026-10-01' },
    { ...records[1], status: 'pending', payDate: '2026-09-30', depositDate: null },
  ] as IncomeTransaction[]
  expect(filterIncomeHistory(changed, sources, { month: '2026-10' })).toEqual([changed[0]])
  expect(filterIncomeHistory(changed, sources, { month: '2026-09' })).toEqual([changed[1]])
  expect(incomeHistoryDate({ ...records[0], depositDate: null })).toBe(records[0].payDate)
})
it('keeps member, source and status filters explicit and clears them without mutating records', () => {
  const original = JSON.stringify(records)
  expect(
    filterIncomeHistory(records, sources, {
      query: '  payroll  ',
      member: 'earner',
      status: 'confirmed',
    }),
  ).toHaveLength(4)
  expect(filterIncomeHistory(records, sources, { member: 'someone else' })).toEqual([])
  expect(filterIncomeHistory(records, sources, { status: 'pending' })).toEqual([])
  expect(filterIncomeHistory(records, sources, {})).toHaveLength(4)
  expect(JSON.stringify(records)).toBe(original)
})
