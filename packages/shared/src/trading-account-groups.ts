import {
  tradingRuleSchema,
  type TradingAccount,
  type TradingResult,
  type TradingPayout,
} from './trading'
import { sumCents } from './outflows'
import { tradingPayoutProgress } from './trading-progress'
import { combineJournal } from './combine-journal'

// Identity and record IDs differ between copied accounts; their financial state must match.
export function groupMatchingTradingAccounts(
  accounts: TradingAccount[],
  results: TradingResult[],
  payouts: TradingPayout[],
  now: string,
) {
  const groups = new Map<string, TradingAccount[]>()
  for (const account of accounts) {
    const p = tradingPayoutProgress(account, results, payouts, now)
    const replaced = new Set(account.ruleSnapshots.map((r) => r.supersedesRuleId).filter(Boolean))
    const rules = account.ruleSnapshots
      .filter((r) => !replaced.has(r.id))
      .map((rule) =>
        Object.fromEntries(
          Object.keys(tradingRuleSchema.shape)
            .filter((key) => !['version', 'supersedesRuleId'].includes(key))
            .sort()
            .map((key) => [key, rule[key as keyof typeof rule] ?? null]),
        ),
      )
    const sessions = new Map<string, { gross: number; fees: number; net: number }>()
    for (const r of new Map(
      results.filter((r) => r.accountId === account.id).map((r) => [r.id, r]),
    ).values()) {
      const day = sessions.get(r.sessionDate) ?? { gross: 0, fees: 0, net: 0 }
      sessions.set(r.sessionDate, {
        gross: sumCents([day.gross, r.grossCents]),
        fees: sumCents([day.fees, r.feesCents]),
        net: sumCents([day.net, r.netCents]),
      })
    }
    const payments = payouts
      .filter((v) => v.accountId === account.id)
      .map((v) => [
        v.requestDate,
        v.status,
        v.requestedCents,
        v.approvedCents,
        v.receivedCents,
        v.depositDate,
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    const key = JSON.stringify({
      provider: account.provider,
      member: account.responsibleMemberId,
      stage: account.stage,
      path: account.xfaPath,
      status: account.status,
      tier: account.tierCents,
      balance: account.reportedBalanceCents,
      maximumLoss: account.maximumLossCents,
      dailyLoss: account.dailyLossCents,
      activation: account.activationDate,
      timezone: account.timezone,
      sessionStart: account.sessionStart,
      hidden: !!account.deletedAt,
      canManage: account.canManage,
      rules,
      sessions: [...sessions].sort(([a], [b]) => a.localeCompare(b)),
      payments,
      start: p.start,
      qualifyingDays: p.qualifyingDays,
      target: p.target,
      estimate: p.estimate,
      journal: account.stage === 'combine' ? combineJournal(account, results, now) : null,
    })
    groups.set(key, [...(groups.get(key) ?? []), account])
  }
  return [...groups.values()]
}
