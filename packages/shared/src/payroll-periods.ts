export const payrollFrequencyLabels = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  semimonthly: 'Twice monthly',
  monthly: 'Monthly',
  annually: 'Annually',
  irregular: 'Irregular / custom',
} as const
export type PayrollFrequency = keyof typeof payrollFrequencyLabels
export const payrollFrequencies = [
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'annually',
  'irregular',
] as const
const date = (day: string) => new Date(day + 'T12:00:00Z')
const iso = (v: Date) => v.toISOString().slice(0, 10)
export const payrollPeriodDays = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1
export function payrollMonthAdd(day: string, months: number) {
  const d = date(day),
    n = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(n, last))
  return iso(d)
}
const add = (day: string, n: number) => iso(new Date(date(day).getTime() + n * 86400000))
export function payrollPeriodEnd(
  start: string,
  frequency: PayrollFrequency,
  splitDay = 15,
  anchor?: string | null,
): string | null {
  if (!start) return null
  if (frequency === 'weekly') return add(start, 6)
  if (frequency === 'biweekly') return add(start, 13)
  if (frequency === 'monthly' || frequency === 'annually') {
    const step = frequency === 'monthly' ? 1 : 12,
      months = anchor
        ? (Number(start.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 +
          Number(start.slice(5, 7)) -
          Number(anchor.slice(5, 7))
        : 0
    return add(
      anchor && payrollMonthAdd(anchor, months) === start
        ? payrollMonthAdd(anchor, months + step)
        : payrollMonthAdd(start, step),
      -1,
    )
  }
  if (frequency === 'semimonthly') {
    const d = date(start),
      day = d.getUTCDate()
    if (day === 1) {
      d.setUTCDate(splitDay)
      return iso(d)
    }
    if (day === splitDay + 1)
      return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)))
  }
  return null
}
export function payrollPeriodIssue(
  start: string,
  end: string,
  frequency: PayrollFrequency,
  splitDay = 15,
  anchor?: string | null,
) {
  const days = payrollPeriodDays(start, end)
  if (!Number.isInteger(days) || days < 1 || days > 366)
    return 'A pay period must contain 1–366 inclusive calendar dates.'
  if (frequency === 'irregular') return null
  if (payrollPeriodEnd(start, frequency, splitDay, anchor) !== end)
    return `Dates do not match ${payrollFrequencyLabels[frequency].toLowerCase()} payroll. Confirm the dates or choose the correct schedule.`
  return null
}
export function payrollPeriodCandidates(
  start: string | null,
  end: string | null,
): PayrollFrequency[] {
  if (!start || !end) return []
  const candidates = payrollFrequencies.filter(
    (f) => f !== 'irregular' && !payrollPeriodIssue(start, end, f),
  )
  // An unusual twice-monthly boundary may overlap a fourteen-day cycle. Never guess.
  const s = date(start),
    e = date(end),
    last = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0)).getUTCDate()
  if (
    !candidates.includes('semimonthly') &&
    s.getUTCFullYear() === e.getUTCFullYear() &&
    s.getUTCMonth() === e.getUTCMonth() &&
    ((s.getUTCDate() === 1 && e.getUTCDate() >= 13 && e.getUTCDate() <= 16) ||
      (s.getUTCDate() >= 14 && s.getUTCDate() <= 17 && e.getUTCDate() === last))
  )
    candidates.push('semimonthly')
  return candidates.length ? candidates : ['irregular']
}
export function payrollSemiMonthlyBoundary(start: string | null, end: string | null) {
  if (!start || !end) return null
  const s = date(start),
    e = date(end)
  if (s.getUTCMonth() !== e.getUTCMonth() || s.getUTCFullYear() !== e.getUTCFullYear()) return null
  if (s.getUTCDate() === 1 && e.getUTCDate() <= 28) return e.getUTCDate()
  const last = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0)).getUTCDate()
  return e.getUTCDate() === last && s.getUTCDate() > 1 && s.getUTCDate() <= 29
    ? s.getUTCDate() - 1
    : null
}
