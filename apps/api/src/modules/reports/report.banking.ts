import type { ReportFilters } from '@goxfinance/shared'
import type { ReportSources } from './report.sources'
import { table, inRange } from './report.tables'
export function bankingTables(source: ReportSources, filters: ReportFilters) {
  const bank = source.banking,
    transactions = bank?.transactions.filter((t) => inRange(t.date, filters.from, filters.to)) ?? []
  return {
    banking: [
      table(
        'Bank balance observations',
        'Latest available snapshots, not reconstructed historical balances, income or additional net-worth assets. Credit-card balances are liabilities. Provider balances may be cached.',
        (bank?.summary.accounts ?? []).map((a) => ({
          account: a.name,
          institution: a.institution,
          type: a.type,
          mask: a.mask,
          currency: a.currency,
          currentBalanceCents: a.balance?.currentCents ?? null,
          availableBalanceCents: a.balance?.availableCents ?? null,
          observedAt: a.balance?.observedAt ?? null,
          institutionAsOf: a.balance?.institutionAsOf ?? null,
          source: a.balance?.source ?? null,
          connectionStatus: a.connectionStatus,
          lastSyncAt: a.lastSyncAt,
          mappedAssetId: a.assetId,
          mappedDebtId: a.debtId,
        })),
      ),
      table(
        'Transaction review status',
        'Selected dates only. Imported activity is not a second accounting ledger; pending, transfers and unreviewed amounts are excluded from income/spending.',
        (bank?.summary.accounts ?? []).map((a) => {
          const rows = transactions.filter((t) => t.accountId === a.id)
          return {
            account: a.name,
            unreviewed: rows.filter(
              (t) => ['unreviewed', 'needs_review'].includes(t.reviewStatus) && !t.removed,
            ).length,
            reconciled: rows.filter((t) => t.reviewStatus === 'reconciled').length,
            pending: rows.filter((t) => t.pending && !t.removed && !t.replacedById).length,
            unmatchedDeposits: rows.filter(
              (t) =>
                t.reviewStatus === 'unreviewed' && !t.pending && !t.removed && t.amountCents > 0,
            ).length,
            unmatchedWithdrawals: rows.filter(
              (t) =>
                t.reviewStatus === 'unreviewed' && !t.pending && !t.removed && t.amountCents < 0,
            ).length,
          }
        }),
      ),
    ],
  }
}
