export function incomeDisplayDate(day: string, year = true) {
  return new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(year ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}
export function incomeDisplayPeriod(start: string | null, end: string | null) {
  if (!start || !end) return 'Not recorded'
  return (
    incomeDisplayDate(start, start.slice(0, 4) !== end.slice(0, 4)) + ' - ' + incomeDisplayDate(end)
  )
}
