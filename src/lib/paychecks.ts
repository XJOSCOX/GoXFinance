import type { Income, Backup } from './schema'

const cents = (value: number) => Math.round(value * 100) / 100
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Estimate only; no paycheck is created until the user confirms the net deposit. */
export function estimatedGross(rate: number | null, regularHours: number | null, overtimeHours: number | null, multiplier = 1.5): number | null {
  if (rate === null || regularHours === null || overtimeHours === null || rate < 0 || regularHours < 0 || overtimeHours < 0 || multiplier < 1) return null
  return cents(rate * regularHours + rate * overtimeHours * multiplier)
}

export function confirmationState(source: Income, transactions: Backup['incomeTransactions'], today: string) {
  const weekday = new Date(`${today}T12:00:00`).getDay()
  const dueToday = weekday === 4 && source.active && (source.payType === 'hourly' || source.payType === 'variable')
  const confirmedToday = transactions.some(row => row.sourceId === source.id && (row.confirmationDate === today || row.date === today))
  const mostRecent = transactions.filter(row => row.sourceId === source.id).map(row => row.confirmationDate ?? row.date).sort().at(-1) ?? null
  const daysSinceLast = mostRecent ? Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${mostRecent}T12:00:00Z`)) / 86400000) : null
  return { dueToday, confirmedToday, missed: daysSinceLast !== null && daysSinceLast > 7, mostRecent }
}

export function incomeHistory(transactions: Backup['incomeTransactions']) {
  const group = (length: number) => {
    const values = new Map<string, { net: number; gross: number; count: number }>()
    for (const row of transactions) {
      const key = length === 7 ? weekStart(row.date) : row.date.slice(0, 7)
      const current = values.get(key) ?? { net: 0, gross: 0, count: 0 }
      values.set(key, { net: cents(current.net + row.amount), gross: cents(current.gross + (row.gross ?? 0)), count: current.count + 1 })
    }
    return [...values.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([period, totals]) => ({ period, ...totals }))
  }
  const weekly = group(7), monthly = group(6)
  const average = (rows: typeof weekly) => rows.length ? cents(rows.reduce((sum, row) => sum + row.net, 0) / rows.length) : 0
  return { weekly, monthly, weeklyAverage: average(weekly), monthlyAverage: average(monthly) }
}

function weekStart(date: string) {
  const day = new Date(`${date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.toISOString().slice(0, 10)
}
