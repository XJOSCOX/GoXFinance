import type { PayrollProfileInput } from './payroll'
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
  const weekday = new Date(end + 'T12:00:00Z').getUTCDay(),
    next = (day: number, includeEnd = false) =>
      payrollDateAdd(end, (day - weekday + 7) % 7 || (includeEnd ? 0 : 7))
  return {
    hours: next(p.hoursDay, true),
    processing: next(p.processingDay),
    statement: next(p.statementDay),
    deposit: next(p.depositDay),
  }
}
