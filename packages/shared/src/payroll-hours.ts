// Minutes are retained for pay calculations; hundredths remain the compatible display snapshot.
export function parsePayrollHours(value: string): { hundredths: number; minutes?: number } {
  const text = value.trim().toLowerCase()
  const decimal = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (decimal) {
    const n = BigInt(decimal[1]) * 100n + BigInt((decimal[2] ?? '').padEnd(2, '0'))
    if (n > 878400n) throw new Error('Hours exceed the supported work period.')
    return { hundredths: Number(n) }
  }
  const clock = /^(\d+):([0-5]?\d)$/.exec(text)
  const labelled = /^(\d+)\s*h(?:ours?)?\s*(?:(\d{1,2})\s*m(?:in(?:ute)?s?)?)?$/.exec(text)
  const parts = clock ?? labelled
  if (parts && Number(parts[2] ?? 0) < 60) {
    const minutes = BigInt(parts[1]) * 60n + BigInt(parts[2] ?? '0')
    if (minutes > 527040n) throw new Error('Hours exceed the supported work period.')
    return { hundredths: Number((minutes * 100n + 30n) / 60n), minutes: Number(minutes) }
  }
  throw new Error(
    'Enter hours as 38h 34min, 38:34, or decimal hours such as 38.5. Minutes must be 0-59.',
  )
}
export function payrollHoursText(hundredths: number | null | undefined, minutes?: number) {
  if (minutes !== undefined) return `${Math.floor(minutes / 60)}h ${minutes % 60}min`
  return hundredths == null ? '' : String(hundredths / 100)
}
