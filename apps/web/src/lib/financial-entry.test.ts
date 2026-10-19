import { it, expect } from 'vitest'
import { readMoney, moneyText } from './financial-entry'
it('parses signed cents exactly, preserving losses and zero without floating point rounding', () => {
  const values = new FormData()
  values.set('loss', '-342.18')
  values.set('zero', '0')
  values.set('small', '0.01')
  expect(readMoney(values, 'loss', true)).toBe(-34218)
  expect(readMoney(values, 'zero', true)).toBe(0)
  expect(readMoney(values, 'small', true)).toBe(1)
  expect(moneyText(-34218)).toBe('-342.18')
  expect(moneyText(0)).toBe('0.00')
  expect(readMoney(values, 'missing')).toBeNull()
  for (const invalid of ['1.001', 'NaN', '1e3', '999999999999999999']) {
    values.set('bad', invalid)
    expect(() => readMoney(values, 'bad', true)).toThrow()
  }
})
