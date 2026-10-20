import { tradingResultDate } from './trading-calculations'
import type { TradingResult } from './trading'
import { sumCents } from './outflows'

/** Results use each account's recorded session date. Payouts are deliberately not inputs. */
export function tradingOverviewTotals(results: TradingResult[], month: string) {
  const rows = [...new Map(results.map((row) => [row.id, row])).values()].filter((row) =>
    tradingResultDate(row).startsWith(month + '-'),
  )
  const split = rows.filter((row) => row.profitCents != null && row.lossCents != null)
  return {
    resultCount: rows.length,
    breakdownCount: split.length,
    missingBreakdownCount: rows.length - split.length,
    profitCents: rows.length && !split.length ? null : sumCents(split.map((r) => r.profitCents!)),
    lossCents: rows.length && !split.length ? null : sumCents(split.map((r) => r.lossCents!)),
    feesCents: sumCents(rows.map((r) => r.feesCents)),
    netCents: sumCents(rows.map((r) => r.netCents)),
  }
}
