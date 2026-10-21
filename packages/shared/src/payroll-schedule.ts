import type { PayrollProfileInput } from './payroll'
import { payrollMonthAdd, payrollPeriodEnd } from './payroll-periods'
export const payrollDateAdd = (day: string, n: number) =>
  new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
export function payrollWorkweek(
  now: Date,
  profile: Pick<PayrollProfileInput, 'timezone' | 'workweekStartDay'>,
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: profile.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now),
    v = (type: string) => parts.find((p) => p.type === type)!.value,
    day = `${v('year')}-${v('month')}-${v('day')}`,
    weekday = new Date(day + 'T12:00:00Z').getUTCDay(),
    start = payrollDateAdd(day, -((weekday - profile.workweekStartDay + 7) % 7))
  return { start, end: payrollDateAdd(start, 6) }
}
export function payrollMilestones(end: string, p: PayrollProfileInput) {
  if (!['weekly', 'biweekly'].includes(p.payFrequency ?? 'weekly'))
    return {
      hours: null,
      processing: null,
      statement: null,
      deposit:
        p.depositOffsetDays === null || p.depositOffsetDays === undefined
          ? null
          : payrollDateAdd(end, p.depositOffsetDays),
    }
  const weekday = new Date(end + 'T12:00:00Z').getUTCDay(),
    next = (day: number, includeEnd = false) =>
      payrollDateAdd(end, (day - weekday + 7) % 7 || (includeEnd ? 0 : 7))
  return {
    hours: p.milestonesConfigured === false ? null : next(p.hoursDay, true),
    processing: p.milestonesConfigured === false ? null : next(p.processingDay),
    statement: p.milestonesConfigured === false ? null : next(p.statementDay),
    deposit: next(p.depositDay),
  }
}
export function payrollCurrentPeriod(
  now: Date,
  p: PayrollProfileInput,
): { start: string; end: string } | null {
  const frequency = p.payFrequency ?? 'weekly'
  if (frequency === 'weekly') return payrollWorkweek(now, p)
  const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: p.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now),
    part = (key: string) => parts.find((v) => v.type === key)!.value,
    today = `${part('year')}-${part('month')}-${part('day')}`
  let start: string
  if (frequency === 'irregular') return null
  if (frequency === 'biweekly') {
    if (!p.periodAnchor) return null
    const cycles = Math.floor((Date.parse(today) - Date.parse(p.periodAnchor)) / (14 * 86400000))
    start = payrollDateAdd(p.periodAnchor, cycles * 14)
  } else if (frequency === 'semimonthly') {
    const split = p.semiMonthlySplitDay ?? 15
    start =
      today.slice(0, 8) + (Number(part('day')) <= split ? '01' : String(split + 1).padStart(2, '0'))
  } else if (p.periodAnchor) {
    const months =
        (Number(today.slice(0, 4)) - Number(p.periodAnchor.slice(0, 4))) * 12 +
        Number(today.slice(5, 7)) -
        Number(p.periodAnchor.slice(5, 7)),
      step = frequency === 'annually' ? 12 : 1
    let offset = Math.floor(months / step) * step
    if (payrollMonthAdd(p.periodAnchor, offset) > today) offset -= step
    start = payrollMonthAdd(p.periodAnchor, offset)
  } else start = frequency === 'annually' ? today.slice(0, 4) + '-01-01' : today.slice(0, 7) + '-01'
  const end = payrollPeriodEnd(start, frequency, p.semiMonthlySplitDay ?? 15, p.periodAnchor)
  return end ? { start, end } : null
}
