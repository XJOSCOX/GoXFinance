import { expect, it } from 'vitest'
import { roundCentsRatio } from './money-calculations'
import { billMonthlyCents } from './bill-calculations'
it('rounds fractional cents exactly for large valid amounts and rejects unsafe results', () => {
  expect(roundCentsRatio(9007199254740991, 1, 3)).toBe(3002399751580330)
  expect(billMonthlyCents(9007199254740991, 'quarterly')).toBe(3002399751580330)
  expect(billMonthlyCents(12345, 'weekly')).toBe(53495)
  expect(billMonthlyCents(12345, 'biweekly')).toBe(26748)
  expect(() => billMonthlyCents(Number.MAX_SAFE_INTEGER, 'weekly')).toThrow()
  expect(() => roundCentsRatio(1.1, 1, 3)).toThrow()
})
