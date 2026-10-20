import type { TradingAccount, TradingResult, TradingPayout } from './trading'
import { tradingSessionDate } from './trading-calculations'
import { payoutSplitEstimate, ruleForPayout } from './trading-rules'
import { sumCents } from './outflows'

export function tradingPayoutProgress(
  account: TradingAccount,
  results: TradingResult[],
  payouts: TradingPayout[],
  now: string,
) {
  const today = tradingSessionDate(now, account.timezone, account.sessionStart)
  const calendarDate = tradingSessionDate(now, account.timezone, '00:00')
  const rule = ruleForPayout(account.ruleSnapshots, calendarDate)
  const start = rule?.progressStartDate ?? account.activationDate ?? rule?.effectiveDate ?? null
  const sessions = new Map<string, number>()
  const seen = new Set<string>()
  for (const result of results) {
    if (
      result.accountId !== account.id ||
      seen.has(result.id) ||
      !start ||
      result.sessionDate < start ||
      result.sessionDate > today
    )
      continue
    seen.add(result.id)
    sessions.set(
      result.sessionDate,
      sumCents([sessions.get(result.sessionDate) ?? 0, result.netCents]),
    )
  }
  const threshold = rule?.minimumWinningDayCents ?? null,
    target = rule?.minimumDays ?? null
  const qualifyingDays =
    threshold == null ? null : [...sessions.values()].filter((net) => net >= threshold).length
  const netCents = sumCents([...sessions.values()])
  const reserved = new Map<string, number>()
  for (const payout of payouts) {
    if (
      payout.accountId === account.id &&
      start &&
      payout.requestDate >= start &&
      payout.requestDate <= calendarDate &&
      ['requested', 'approved', 'paid'].includes(payout.status)
    )
      reserved.set(payout.id, payout.approvedCents ?? payout.requestedCents)
  }
  const reservedCents = sumCents([...reserved.values()])
  const basisCents = Math.min(
    Math.max(0, netCents - reservedCents),
    rule?.maximumPayoutCents ?? Number.MAX_SAFE_INTEGER,
  )
  const estimate =
    account.stage !== 'combine' && rule && start
      ? payoutSplitEstimate(basisCents, rule.profitShareBps)
      : null
  return {
    rule,
    start,
    today,
    qualifyingDays,
    target,
    threshold,
    sessionCount: sessions.size,
    netCents,
    reservedCents,
    basisCents,
    estimate,
    targetMet: qualifyingDays != null && target != null ? qualifyingDays >= target : null,
    currentSessionIncluded: sessions.has(today),
  }
}

export function combinedTradingProgress(
  accounts: TradingAccount[],
  results: TradingResult[],
  payouts: TradingPayout[],
  now: string,
) {
  const active = [
    ...new Map(
      accounts
        .filter((a) => a.stage !== 'combine' && !a.deletedAt && a.status === 'active')
        .map((a) => [a.id, a]),
    ).values(),
  ]
  const rows = active.map((a) => tradingPayoutProgress(a, results, payouts, now))
  const known = rows.filter((r) => r.estimate !== null)
  return {
    accountCount: rows.length,
    estimatedAccountCount: known.length,
    targetMetCount: rows.filter((r) => r.targetMet).length,
    estimatedTraderCents: known.length ? sumCents(known.map((r) => r.estimate!.traderCents)) : null,
    estimatedProviderCents: known.length
      ? sumCents(known.map((r) => r.estimate!.providerCents))
      : null,
  }
}
