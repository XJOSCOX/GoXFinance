import { expect, it } from 'vitest'
import { moneyText, parseMoney } from './payment-money'
import { formatMoney } from './money'
it('roundtrips integer cents exactly, including the supported upper range', () => {
  for (const value of [1, 100, 12345, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1])
    expect(parseMoney(moneyText(value), true)).toBe(value)
  expect(formatMoney(Number.MAX_SAFE_INTEGER)).toBe('$90,071,992,547,409.91')
  expect(formatMoney(-12345)).toBe('-$123.45')
})
it.each(['1.001', '-1', '1e3', 'NaN', '90071992547409.92'])(
  'rejects imprecise or unsupported input %s',
  (value) => expect(() => parseMoney(value, true)).toThrow(),
)
