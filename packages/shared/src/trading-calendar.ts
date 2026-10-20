import type { TradingResult } from './trading'
import { tradingResultDate } from './trading-calculations'
import { sumCents } from './outflows'

export type JournalDay = {
  date: string
  netCents: number
  entries: number
  trades: number
  missingTradeCounts: number
}
export function tradingCalendar(results: TradingResult[], accountIds: string[], month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid reporting month')
  const ids = new Set(accountIds),
    days = new Map<string, JournalDay>()
  for (const row of new Map(results.map((r) => [r.id, r])).values()) {
    const date = tradingResultDate(row)
    if (!ids.has(row.accountId) || !date.startsWith(month + '-')) continue
    const day = days.get(date) ?? {
      date,
      netCents: 0,
      entries: 0,
      trades: 0,
      missingTradeCounts: 0,
    }
    days.set(date, {
      date,
      netCents: sumCents([day.netCents, row.netCents]),
      entries: day.entries + 1,
      trades: day.trades + (row.tradeCount ?? 0),
      missingTradeCounts: day.missingTradeCounts + (row.tradeCount == null ? 1 : 0),
    })
  }
  const first = new Date(`${month}-01T00:00:00Z`)
  const start = new Date(first)
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7))
  const end = new Date(first)
  end.setUTCMonth(end.getUTCMonth() + 1, 0)
  const weekCount = Math.ceil(((end.getTime() - start.getTime()) / 86400000 + 1) / 7)
  const weeks = Array.from({ length: weekCount }, (_, week) => {
    const cells = Array.from({ length: 7 }, (_, day) => {
      const date = new Date(start.getTime() + (week * 7 + day) * 86400000)
        .toISOString()
        .slice(0, 10)
      return { date, inMonth: date.startsWith(month + '-'), result: days.get(date) ?? null }
    })
    return {
      cells,
      netCents: sumCents(cells.map((c) => c.result?.netCents ?? 0)),
      entries: cells.reduce((n, c) => n + (c.result?.entries ?? 0), 0),
    }
  })
  return {
    weeks,
    netCents: sumCents([...days.values()].map((d) => d.netCents)),
    recordedDays: days.size,
  }
}
