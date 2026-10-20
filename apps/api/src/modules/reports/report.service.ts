import {
  reportFilterSchema,
  localBillDate,
  type PublicUser,
  type FinancialReport,
} from '@goxfinance/shared'
import { FinancialError, type FinancialAccess } from '../households/financial-access'
import type { reportSources } from './report.sources'
import { reportScope } from './report.scope'
import { activityTables } from './report.activity'
import { positionTables } from './report.positions'
import { tradingTables } from './report.trading'
import { bankingTables } from './report.banking'
export function reportService(access: FinancialAccess, sources: ReturnType<typeof reportSources>) {
  function load(user: PublicUser, home: string) {
    access.context(user, home)
    return sources(user, home)
  }
  return {
    options(user: PublicUser, home: string) {
      return reportScope(access, user, home, load(user, home)).options
    },
    preview(user: PublicUser, home: string, body: unknown): FinancialReport {
      const filters = reportFilterSchema.parse(body),
        scoped = reportScope(access, user, home, load(user, home), filters),
        today = localBillDate()
      const { source, member } = scoped,
        positions = positionTables(source, filters, today, member, scoped.protectedAssetIds)
      const tables = {
        ...bankingTables(source, filters),
        ...activityTables(source, filters, today),
        ...positions.tables,
        ...tradingTables(source, filters, today),
      }
      const chosen = filters.kind === 'all' ? Object.values(tables).flat() : tables[filters.kind]
      if (
        chosen.reduce((n, t) => n + t.rows.length, 0) > 10000 ||
        chosen.reduce((n, t) => n + t.rows.length * t.columns.length, 0) > 200000
      )
        throw new FinancialError(
          'Report too large. Choose a narrower date range or report type.',
          413,
        )
      return {
        schemaVersion: 1,
        kind: 'financial_report_export',
        restorable: false,
        generatedAt: new Date().toISOString(),
        householdId: home,
        householdName: scoped.ctx.home.name,
        scope: member
          ? 'Member-associated records (joint records counted once; do not sum member reports)'
          : 'Household records',
        filters,
        notes: [
          'Financial report export, not a restorable SQLite backup. Current corrected ledger values are used; historical observations and saved snapshots retain their dates.',
          'Confirmed deposits and completed cash outflows only affect recorded cash flow. This is not an actual bank balance. Pending, scheduled and expected records are separate.',
          'Money uses integer cents. Null means unknown. Estimates, projections and valuations are labeled by table. Source timestamps are UTC; transaction dates retain their original date-only meaning.',
          'Category filters apply to purchase allocations, bill payment period categories, debt repayment categories and budget rows. Debt filters apply to debts, linked bills, settlements and assets. Account/group filters apply to trading and linked goals/payouts. Unrelated report sections retain their own scope.',
          'Debt balances and asset values are as of the earlier of report end and today. Current ownership and duplicate links apply to backdated views; captured snapshots preserve their original scope.',
          'Saved household projections are omitted from member exports to protect private household information.',
          'Ordinary PDF, XLSX, CSV and JSON downloads are not encrypted by SQLite database encryption. Store downloads securely. No report files are retained on the server.',
          ...(filters.kind === 'all' || filters.kind === 'net_worth' || filters.kind === 'debts'
            ? positions.warnings
            : []),
        ],
        tables: chosen,
      }
    },
  }
}
export type ReportService = ReturnType<typeof reportService>
