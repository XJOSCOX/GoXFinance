import { expect, it } from 'vitest'
import { readPayrollTime, payrollTimeParts } from './payroll-time-entry'
function fields(hours: string, minutes: string) {
  const f = new FormData()
  f.set('regularHours', hours)
  f.set('regularMinutes', minutes)
  return f
}
it('combines separate hour/minute fields without treating minutes as decimal hours', () => {
  expect(readPayrollTime(fields('38', '34'), 'regular')).toEqual({
    hundredths: 3857,
    minutes: 2314,
  })
  expect(readPayrollTime(fields('0', '34'), 'regular')).toEqual({ hundredths: 57, minutes: 34 })
})
it.each([
  ['38', '60'],
  ['38', '-1'],
  ['1.5', '30'],
  ['1', '2.5'],
])('rejects invalid separate fields %s hours, %s minutes', (hours, minutes) => {
  expect(() => readPayrollTime(fields(hours, minutes), 'regular')).toThrow()
})
it('retains old decimal precision unless the displayed time is edited', () => {
  const saved = { hundredths: 3857 },
    parts = payrollTimeParts(saved)
  expect(readPayrollTime(fields(parts.hours, parts.minutes), 'regular', saved)).toEqual({
    hundredths: 3857,
    minutes: undefined,
  })
  expect(readPayrollTime(fields('38', '35'), 'regular', saved)).toEqual({
    hundredths: 3858,
    minutes: 2315,
  })
  expect(readPayrollTime(fields('', '0'), 'regular', {}, true).hundredths).toBeNull()
})
