import type { TradingRule } from './trading'

export function latestSavedRule<T extends TradingRule & { id: string; createdAt: string }>(
  rules: T[],
) {
  const replaced = new Set(rules.map((r) => r.supersedesRuleId).filter(Boolean))
  return rules
    .filter((r) => !replaced.has(r.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0]
}

export function payoutSplitEstimate(
  amountCents: number | null,
  traderShareBps: number | null | undefined,
) {
  if (
    amountCents == null ||
    traderShareBps == null ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 0 ||
    !Number.isInteger(traderShareBps) ||
    traderShareBps < 0 ||
    traderShareBps > 10000
  )
    return null
  const traderCents = Number((BigInt(amountCents) * BigInt(traderShareBps) + 5000n) / 10000n)
  return { traderCents, providerCents: amountCents - traderCents }
}

export function ruleForPayout<T extends TradingRule & { createdAt: string; id: string }>(
  rules: T[],
  date: string,
  recordedAt?: string,
) {
  const known = rules.filter(
    (r) => r.effectiveDate <= date && (!recordedAt || r.createdAt <= recordedAt),
  )
  const replaced = new Set(known.map((r) => r.supersedesRuleId).filter(Boolean))
  return known
    .filter((r) => !replaced.has(r.id) && r.effectiveDate <= date)
    .sort(
      (a, b) =>
        b.effectiveDate.localeCompare(a.effectiveDate) ||
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
    )[0]
}
