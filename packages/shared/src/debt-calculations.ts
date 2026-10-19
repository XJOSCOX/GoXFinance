import type { Debt, DebtConfidence, DebtType, PaymentStatus } from './debts'

export type MemberDebtTotal = { memberId: string; knownBalanceCents: number; unknownCount: number; sharedCount: number }
export type DebtSummary = {
  accountCount: number
  countedObligationCount: number
  unknownBalanceCount: number
  confirmedBalanceCents: number
  estimatedBalanceCents: number
  unverifiedBalanceCents: number
  totalPastDueCents: number
  totalKnownMinimumCents: number
  balancesByType: Partial<Record<DebtType, number>>
  balancesByPaymentStatus: Partial<Record<PaymentStatus, number>>
  byMember: MemberDebtTotal[]
}

// A verified original/collection link represents one obligation. Within each group, use the
// most trustworthy known balance, then the largest balance at that confidence level.
export function debtObligationGroups(debts: Debt[]): Debt[][] {
  const active = debts.filter(debt => !debt.isArchived)
  const byId = new Map(active.map(debt => [debt.id, debt]))
  const parent = new Map(active.map(debt => [debt.id, debt.id]))
  function root(id: string): string {
    const next = parent.get(id)!
    if (next === id) return id
    const result = root(next)
    parent.set(id, result)
    return result
  }
  for (const debt of active) {
    if (!debt.duplicateLinkVerified || !debt.linkedOriginalDebtId || !byId.has(debt.linkedOriginalDebtId)) continue
    const original = byId.get(debt.linkedOriginalDebtId)!
    if (original.householdId !== debt.householdId) continue
    parent.set(root(debt.id), root(original.id))
  }
  const groups = new Map<string, Debt[]>()
  for (const debt of active) groups.set(root(debt.id), [...(groups.get(root(debt.id)) ?? []), debt])
  return [...groups.values()]
}

const confidenceRank: Record<DebtConfidence, number> = { confirmed: 3, estimated: 2, unverified: 1 }
function representative(group: Debt[]) {
  return [...group].sort((a, b) => {
    if (a.currentBalanceCents === null) return b.currentBalanceCents === null ? 0 : 1
    if (b.currentBalanceCents === null) return -1
    return confidenceRank[b.confidence] - confidenceRank[a.confidence]
      || b.currentBalanceCents - a.currentBalanceCents
  })[0]
}

export function calculateDebtSummary(debts: Debt[]): DebtSummary {
  const groups = debtObligationGroups(debts)
  const summary: DebtSummary = { accountCount: debts.filter(debt => !debt.isArchived).length,
    countedObligationCount: groups.length, unknownBalanceCount: 0, confirmedBalanceCents: 0,
    estimatedBalanceCents: 0, unverifiedBalanceCents: 0, totalPastDueCents: 0,
    totalKnownMinimumCents: 0, balancesByType: {}, balancesByPaymentStatus: {}, byMember: [] }
  const members = new Map<string, MemberDebtTotal>()
  for (const group of groups) {
    const selected = representative(group)
    const balance = selected.currentBalanceCents
    if (balance === null) summary.unknownBalanceCount += 1
    else {
      const key = `${selected.confidence}BalanceCents` as const
      summary[key] += balance
      summary.balancesByType[selected.accountType] = (summary.balancesByType[selected.accountType] ?? 0) + balance
      summary.balancesByPaymentStatus[selected.paymentStatus] = (summary.balancesByPaymentStatus[selected.paymentStatus] ?? 0) + balance
    }
    summary.totalPastDueCents += Math.max(...group.map(debt => debt.pastDueAmountCents ?? 0))
    summary.totalKnownMinimumCents += Math.max(...group.map(debt => debt.minimumPaymentCents ?? 0))
    const ids = new Set(group.flatMap(debt => debt.memberAssignments.map(item => item.memberId)))
    for (const memberId of ids) {
      const item = members.get(memberId) ?? { memberId, knownBalanceCents: 0, unknownCount: 0, sharedCount: 0 }
      if (balance === null) item.unknownCount += 1
      else item.knownBalanceCents += balance
      if (ids.size > 1) item.sharedCount += 1
      members.set(memberId, item)
    }
  }
  summary.byMember = [...members.values()]
  return summary
}
