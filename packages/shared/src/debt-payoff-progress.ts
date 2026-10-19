import { debtObligationGroups, representativeDebtBalance } from './debt-calculations'
import type { Debt } from './debts'
import type { DebtBalanceHistory } from './debt-payments'
import { localBillDate } from './financial-dates'
import { sumCents } from './outflows'

export function debtPayoffProgress(
  debts: Debt[],
  history: DebtBalanceHistory[],
  today = localBillDate(),
) {
  const groups = debtObligationGroups(debts)
  const accounts = groups.flatMap((group) => {
    // Follow the same representative used for household totals. Never splice one
    // creditor's baseline onto another collection record's balance.
    const debt = representativeDebtBalance(group)
    const dates = new Map<string, DebtBalanceHistory>()
    const entries = history
      .filter(
        (entry) =>
          entry.debtId === debt.id &&
          entry.householdId === debt.householdId &&
          entry.effectiveDate <= today,
      )
      .sort(
        (a, b) =>
          a.effectiveDate.localeCompare(b.effectiveDate) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      )
    // Later corrections for the same effective date replace that observation.
    for (const entry of entries) dates.set(entry.effectiveDate, entry)
    const observations = [...dates.values()]
    if (observations.length < 2) return []
    const first = observations[0],
      last = observations[observations.length - 1]
    return [
      {
        debtId: debt.id,
        name: debt.creditorName,
        baselineCents: first.balanceCents,
        remainingCents: last.balanceCents,
        baselineDate: first.effectiveDate,
        latestDate: last.effectiveDate,
        unverified:
          debt.confidence !== 'confirmed' ||
          [first, last].some(
            (entry) => !['creditor_statement', 'reconciliation'].includes(entry.source),
          ),
      },
    ]
  })
  const baselineCents = sumCents(accounts.map((account) => account.baselineCents))
  const remainingCents = sumCents(accounts.map((account) => account.remainingCents))
  const netChange = sumCents([baselineCents, -remainingCents])
  return {
    accounts,
    baselineCents,
    remainingCents,
    reductionCents: Math.max(0, netChange),
    increaseCents: Math.max(0, -netChange),
    trackedCount: accounts.length,
    missingHistoryCount: groups.length - accounts.length,
    unverifiedCount: accounts.filter((account) => account.unverified).length,
    percent:
      baselineCents > 0
        ? Math.min(
            remainingCents > 0 ? 99 : 100,
            Math.floor((Math.max(0, netChange) / baselineCents) * 100),
          )
        : null,
  }
}
