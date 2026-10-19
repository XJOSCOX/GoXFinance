import type { TradingAccount, TradingResult } from './trading'
import { sumCents } from './outflows'
// Sessions are named by their START date in the account's configured timezone.
export function tradingSessionDate(timestamp: string, timezone: string, sessionStart: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp))
  const part = (name: string) => parts.find((p) => p.type === name)!.value
  const date = `${part('year')}-${part('month')}-${part('day')}`
  return `${part('hour')}:${part('minute')}` < sessionStart
    ? new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
    : date
}
export function tradingWeek(date: string) {
  const day = new Date(date + 'T00:00:00Z'),
    offset = (day.getUTCDay() + 6) % 7
  return new Date(day.getTime() - offset * 86400000).toISOString().slice(0, 10)
}
export function tradingPerformance(
  results: TradingResult[],
  accountIds: string[],
  group: 'day' | 'week' | 'month' = 'day',
) {
  const buckets = new Map<string, TradingResult[]>()
  for (const result of results.filter((r) => accountIds.includes(r.accountId))) {
    const key =
      group === 'month'
        ? result.sessionDate.slice(0, 7)
        : group === 'week'
          ? tradingWeek(result.sessionDate)
          : result.sessionDate
    buckets.set(key, [...(buckets.get(key) ?? []), result])
  }
  return [...buckets]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([period, rows]) => ({
      period,
      grossCents: sumCents(rows.map((r) => r.grossCents)),
      feesCents: sumCents(rows.map((r) => r.feesCents)),
      netCents: sumCents(rows.map((r) => r.netCents)),
      sessionCount: rows.length,
    }))
}
export function tradingRisk(account: TradingAccount, results: TradingResult[], timestamp: string) {
  const date = tradingSessionDate(timestamp, account.timezone, account.sessionStart)
  const netCents = sumCents(
    results
      .filter((r) => r.accountId === account.id && r.sessionDate === date)
      .map((r) => r.netCents),
  )
  return {
    sessionDate: date,
    netCents,
    dailyLimitReached: account.dailyLossCents !== null && netCents <= -account.dailyLossCents,
  }
}
