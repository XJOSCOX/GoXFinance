import { parsePayrollHours } from '@goxfinance/shared'
export type SavedPayrollTime = { hundredths?: number | null; minutes?: number }
export function payrollTimeParts(saved: SavedPayrollTime = {}) {
  if (saved.minutes !== undefined)
    return { hours: String(Math.floor(saved.minutes / 60)), minutes: String(saved.minutes % 60) }
  if (saved.hundredths == null) return { hours: '', minutes: '' }
  return {
    hours: String(Math.floor(saved.hundredths / 100)),
    minutes: String(Math.round((saved.hundredths % 100) * 0.6)),
  }
}
export function readPayrollTime(
  f: FormData,
  name: string,
  saved: SavedPayrollTime = {},
  nullable = false,
  required = false,
) {
  const hours = String(f.get(name + 'Hours') ?? '').trim(),
    minutes = String(f.get(name + 'Minutes') ?? '').trim(),
    initial = payrollTimeParts(saved)
  // Historical decimal-hour records retain their precision until the user changes the time.
  if (saved.hundredths != null && hours === initial.hours && minutes === initial.minutes)
    return { hundredths: saved.hundredths, minutes: saved.minutes }
  if (!hours && (!minutes || minutes === '0') && nullable)
    return { hundredths: null, minutes: undefined }
  if (required && !hours)
    throw new Error('Enter hours explicitly; enter 0 when there are only minutes.')
  if (
    (hours && !/^\d+$/.test(hours)) ||
    (minutes && !/^\d+$/.test(minutes)) ||
    Number(minutes || '0') > 59
  )
    throw new Error('Enter whole hours and minutes from 0 to 59.')
  return parsePayrollHours(`${hours || '0'}h ${minutes || '0'}min`)
}
