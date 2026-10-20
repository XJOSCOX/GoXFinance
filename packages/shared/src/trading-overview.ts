import { tradingResultDate } from './trading-calculations'
import type { TradingResult, TradingAccount } from './trading'
import { sumCents } from './outflows'

/** Results use each account's recorded session date. Payouts are deliberately not inputs. */
export function tradingOverviewTotals(results: TradingResult[], month: string) {
  const rows = [...new Map(results.map((row) => [row.id, row])).values()].filter((row) =>
    tradingResultDate(row).startsWith(month + '-'),
  )
  return tradingResultTotals(rows)
}
export function tradingResultTotals(results: TradingResult[]) {
  const rows = [...new Map(results.map((row) => [row.id, row])).values()]
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

/** Stage classification never uses account balances, tiers or payout deposits as P&L. */
export function tradingStageTotals(
  accounts: TradingAccount[],
  results: TradingResult[],
  month?: string,
) {
  const uniqueAccounts = [...new Map(accounts.map((a) => [a.id, a])).values()]
  const rows = [...new Map(results.map((r) => [r.id, r])).values()].filter(
    (r) => !month || tradingResultDate(r).startsWith(month + '-'),
  )
  const build = (stage: 'combine' | 'funded') => {
    const selected = uniqueAccounts.filter((a) =>
      stage === 'combine' ? a.stage === 'combine' : ['xfa', 'lfa'].includes(a.stage),
    )
    const ids = new Set(selected.map((a) => a.id))
    return {
      stage,
      ...tradingResultTotals(rows.filter((r) => ids.has(r.accountId))),
      accounts: selected.map((a) => ({
        id: a.id,
        nickname: a.nickname,
        stage: a.stage,
        ...tradingResultTotals(rows.filter((r) => r.accountId === a.id)),
      })),
    }
  }
  const validIds = new Set(
    uniqueAccounts.filter((a) => ['combine', 'xfa', 'lfa'].includes(a.stage)).map((a) => a.id),
  )
  return {
    combine: build('combine'),
    funded: build('funded'),
    unclassifiedCount: rows.filter((r) => !validIds.has(r.accountId)).length,
  }
}
export type TradingStageReport = ReturnType<typeof tradingStageTotals>
