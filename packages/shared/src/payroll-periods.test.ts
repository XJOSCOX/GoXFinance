import { expect, it } from 'vitest'
import {
  payrollPeriodIssue,
  payrollPeriodCandidates,
  payrollPeriodEnd,
  payrollPeriodDays,
} from './payroll-periods'
import { payrollCurrentPeriod, payrollMilestones } from './payroll-schedule'
import { profile, hours } from './payroll.fixture'
import { weeklyHoursSchema } from './payroll'
it.each([
  ['weekly', '2026-10-05', '2026-10-11'],
  ['biweekly', '2026-10-05', '2026-10-18'],
  ['semimonthly', '2026-10-01', '2026-10-15'],
  ['semimonthly', '2026-10-16', '2026-10-31'],
  ['semimonthly', '2028-02-16', '2028-02-29'],
  ['monthly', '2028-02-01', '2028-02-29'],
  ['monthly', '2026-09-17', '2026-10-16'],
  ['annually', '2028-01-01', '2028-12-31'],
  ['irregular', '2026-10-03', '2026-10-21'],
] as const)('validates %s periods without forcing seven days', (frequency, start, end) => {
  expect(payrollPeriodIssue(start, end, frequency)).toBeNull()
  expect(
    weeklyHoursSchema.safeParse({
      ...hours,
      payFrequency: frequency,
      workweekStart: start,
      workweekEnd: end,
    }).success,
  ).toBe(true)
})
it('keeps fortnightly and twice-monthly schedules distinct and asks for ambiguous or missing dates', () => {
  expect(payrollPeriodCandidates('2026-02-01', '2026-02-14')).toEqual(['biweekly', 'semimonthly'])
  expect(payrollPeriodCandidates('2026-10-01', '2026-10-31')).toEqual(['monthly'])
  expect(payrollPeriodCandidates(null, '2026-10-31')).toEqual([])
  expect(payrollPeriodIssue('2026-10-16', '2026-10-31', 'biweekly')).not.toBeNull()
  expect(payrollPeriodIssue('2026-10-05', '2026-10-12', 'weekly')).not.toBeNull()
  expect(payrollPeriodIssue('2026-10-12', '2026-10-05', 'irregular')).not.toBeNull()
})
it('preserves anchored fortnightly cycles, calendar month lengths and month-end anchors', () => {
  const now = new Date('2026-10-20T18:00:00Z')
  expect(
    payrollCurrentPeriod(now, { ...profile, payFrequency: 'biweekly', periodAnchor: '2026-10-05' }),
  ).toEqual({ start: '2026-10-19', end: '2026-11-01' })
  expect(payrollCurrentPeriod(now, { ...profile, payFrequency: 'biweekly' })).toBeNull()
  expect(payrollCurrentPeriod(now, { ...profile, payFrequency: 'monthly' })).toEqual({
    start: '2026-10-01',
    end: '2026-10-31',
  })
  expect(
    payrollCurrentPeriod(new Date('2026-03-01T18:00:00Z'), {
      ...profile,
      payFrequency: 'monthly',
      periodAnchor: '2026-01-31',
    }),
  ).toEqual({ start: '2026-02-28', end: '2026-03-30' })
  expect(payrollPeriodEnd('2026-02-28', 'monthly', 15, '2026-01-31')).toBe('2026-03-30')
  expect(payrollCurrentPeriod(now, { ...profile, payFrequency: 'irregular' })).toBeNull()
})
it('scales real-hour bounds to the period and leaves unconfigured nonweekly bank dates unknown', () => {
  expect(
    weeklyHoursSchema.safeParse({
      ...hours,
      payFrequency: 'monthly',
      workweekStart: '2026-10-01',
      workweekEnd: '2026-10-31',
      regularHundredths: 17333,
    }).success,
  ).toBe(true)
  expect(weeklyHoursSchema.safeParse({ ...hours, regularHundredths: 16900 }).success).toBe(false)
  expect(payrollPeriodDays('2028-02-01', '2028-02-29')).toBe(29)
  expect(
    payrollMilestones('2026-10-31', { ...profile, payFrequency: 'monthly' }).deposit,
  ).toBeNull()
  expect(
    payrollMilestones('2026-10-31', { ...profile, payFrequency: 'monthly', depositOffsetDays: 5 })
      .deposit,
  ).toBe('2026-11-05')
})
