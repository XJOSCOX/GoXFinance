import { expect, it } from 'vitest'
import type { IncomeTransaction } from '@goxfinance/shared'
import { paycheckOverview } from './paycheck-overview'
const base = {
  id: 'first',
  payDate: '2026-10-16',
  depositDate: '2026-10-16',
  status: 'confirmed',
  actualGrossCents: 100000,
  deductionsCents: 20000,
  actualNetCents: 80000,
} as IncomeTransaction
it('uses only received deposits in the selected month and keeps documented pending pay separate', () => {
  const result = paycheckOverview(
    [
      base,
      { ...base, id: 'pending', status: 'pending', depositDate: null, payDate: '2026-10-23' },
      { ...base, id: 'old', depositDate: '2026-09-25' },
      { ...base, id: 'future', depositDate: '2026-11-01' },
      { ...base, id: 'cancelled', status: 'cancelled' },
    ],
    '2026-10',
    '2026-10-20',
  )
  expect(result.receivedCount).toBe(1)
  expect(result.gross).toEqual({ cents: 100000, missing: 0 })
  expect(result.deductions).toEqual({ cents: 20000, missing: 0 })
  expect(result.latest?.id).toBe('pending')
})
it('preserves unknowns and zero amounts without inventing missing gross or deductions', () => {
  const result = paycheckOverview(
    [base, { ...base, id: 'unknown', actualGrossCents: null, deductionsCents: null }],
    '2026-10',
    '2026-10-20',
  )
  expect(result.gross).toEqual({ cents: 100000, missing: 1 })
  expect(
    paycheckOverview(
      [{ ...base, actualGrossCents: 0, deductionsCents: 0 }],
      '2026-10',
      '2026-10-20',
    ).gross.cents,
  ).toBe(0)
  expect(paycheckOverview([], '2026-10', '2026-10-20').gross.cents).toBeNull()
})
