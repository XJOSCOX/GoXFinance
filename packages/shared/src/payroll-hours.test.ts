import { expect, it } from 'vitest'
import { parsePayrollHours, payrollHoursText } from './payroll-hours'
import { payrollGross } from './payroll-calculations'
import { weeklyHoursSchema } from './payroll'
import { hours } from './payroll.fixture'
it.each(['38h 34min', '38h34m', '38:34', '38 hours 34 minutes'])(
  'accepts Deputy time %s and retains exact minutes',
  (input) => {
    expect(parsePayrollHours(input)).toEqual({ hundredths: 3857, minutes: 2314 })
    expect(payrollHoursText(3857, 2314)).toBe('38h 34min')
  },
)
it('keeps decimal hours distinct and calculates pay from minutes before rounding to cents', () => {
  expect(parsePayrollHours('38.34')).toEqual({ hundredths: 3834 })
  const h = weeklyHoursSchema.parse({
    ...hours,
    regularHundredths: 3857,
    regularMinutes: 2314,
    overtimeHundredths: 0,
    ptoHundredths: 0,
  })
  expect(payrollGross(h).grossCents).toBe(96417)
  expect(payrollGross({ ...h, regularMinutes: undefined }).grossCents).toBe(96425)
})
it.each(['38h 60min', '38:60', '-1h 5min', '38.345', '1:2:3', 'not hours', ''])(
  'rejects invalid time %s',
  (input) => {
    expect(() => parsePayrollHours(input)).toThrow()
  },
)
it('rejects conflicting minute and hundredth snapshots', () => {
  expect(
    weeklyHoursSchema.safeParse({ ...hours, regularMinutes: 2314, regularHundredths: 3834 })
      .success,
  ).toBe(false)
})
