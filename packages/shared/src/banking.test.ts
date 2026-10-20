import { expect, it } from 'vitest'
import { bankDecimalCents } from './banking'
it('normalizes exact cents, negative values and zero without floating point rounding', () => {
  expect(bankDecimalCents('342.18')).toBe(34218)
  expect(bankDecimalCents('-20.01')).toBe(-2001)
  expect(bankDecimalCents(0)).toBe(0)
  expect(bankDecimalCents('1,200.00')).toBe(120000)
  expect(bankDecimalCents('-$1,200.00')).toBe(-120000)
  for (const v of [
    '1,2',
    '12,34.00',
    '1,,200',
    '1.001',
    'NaN',
    'Infinity',
    '1e9',
    '900719925474099.99',
  ])
    expect(() => bankDecimalCents(v)).toThrow()
})
