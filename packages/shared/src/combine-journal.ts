import type { TradingAccount, TradingResult } from './trading'
import { tradingSessionDate } from './trading-calculations'
import { sumCents } from './outflows'

// A reconstructed journal, not a provider balance feed. Intraday lows are unknown.
export function combineJournal(account: TradingAccount, results: TradingResult[], now: string) {
  const today = tradingSessionDate(now, account.timezone, account.sessionStart)
  const start = account.activationDate
  const startingBalanceCents = account.tierCents
  const loss = account.maximumLossCents
  const sessions = new Map<string, number>()
  const seen = new Set<string>()
  for (const row of results) {
    if (
      row.accountId !== account.id ||
      seen.has(row.id) ||
      !start ||
      row.sessionDate < start ||
      row.sessionDate > today
    )
      continue
    seen.add(row.id)
    sessions.set(row.sessionDate, sumCents([sessions.get(row.sessionDate) ?? 0, row.netCents]))
  }
  let balance = start ? startingBalanceCents : null
  let high = start ? startingBalanceCents : null
  let floor =
    !start || startingBalanceCents == null || loss == null
      ? null
      : sumCents([startingBalanceCents, -loss])
  let breached = false
  const rows = [...sessions]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, netCents]) => {
      const previousFloorCents = floor
      balance = balance == null ? null : sumCents([balance, netCents])
      const reachedFloor = balance != null && floor != null && balance <= floor
      breached ||= reachedFloor
      const completed = date < today
      if (
        completed &&
        balance != null &&
        high != null &&
        startingBalanceCents != null &&
        loss != null
      ) {
        high = Math.max(high, balance)
        floor = Math.min(startingBalanceCents, sumCents([high, -loss]))
      }
      return {
        date,
        netCents,
        balanceCents: balance,
        previousFloorCents,
        floorCents: floor,
        completed,
        reachedFloor,
      }
    })
  const review = start ? new Date(`${start}T00:00:00Z`) : null
  review?.setUTCDate(review.getUTCDate() + 30)
  const reviewDate = review?.toISOString().slice(0, 10) ?? null
  const calendarDate = tradingSessionDate(now, account.timezone, '00:00')
  return {
    start,
    today,
    rows,
    startingBalanceCents,
    balanceCents: balance,
    highestClosingBalanceCents: high,
    floorCents: floor,
    locked: floor != null && floor === startingBalanceCents,
    bufferCents: balance == null || floor == null ? null : sumCents([balance, -floor]),
    recordedBreach: breached,
    reviewDate,
    reviewDue: reviewDate != null && calendarDate >= reviewDate,
    daysSinceStart: start
      ? Math.max(0, Math.floor((Date.parse(calendarDate) - Date.parse(start)) / 86400000))
      : null,
  }
}
