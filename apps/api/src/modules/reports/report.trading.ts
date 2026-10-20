import {
  goalProgress,
  goalWindows,
  tradingResultDate,
  tradingStageTotals,
  tradingResultTotals,
  type ReportFilters,
} from '@goxfinance/shared'
import type { ReportSources } from './report.sources'
import { table, inRange } from './report.tables'
function reportWindows(goal: Parameters<typeof goalWindows>[0], from: string, to: string) {
  const windows = []
  let cursor = from
  while (cursor <= to) {
    const w = goalWindows(goal, cursor)[0]
    if (w.startDate <= to && w.endDate >= from) windows.push(w)
    const next = new Date(w.endDate + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + 1)
    const key = next.toISOString().slice(0, 10)
    if (key <= cursor) break
    cursor = key
  }
  return windows
}
export function tradingTables(s: ReportSources, f: ReportFilters, today: string) {
  const results = s.results.filter(
    (r) => inRange(tradingResultDate(r), f.from, f.to) && tradingResultDate(r) <= today,
  )
  const stages = tradingStageTotals(s.accounts, results)
  const summary = (rows: typeof results) => {
    const t = tradingResultTotals(rows)
    return {
      ...t,
      profitCents: t.missingBreakdownCount ? null : t.profitCents,
      lossCents: t.missingBreakdownCount ? null : t.lossCents,
    }
  }
  const stageRow = (stage: 'combine' | 'funded') => ({
    stage,
    ...summary(results.filter((r) => stages[stage].accounts.some((a) => a.id === r.accountId))),
  })
  return {
    trading: [
      table(
        'Trading performance',
        'Combine simulated results and funded P&L are separate; neither is cash income. Unknown breakdowns remain unknown.',
        [stageRow('combine'), stageRow('funded')],
      ),
      table(
        'Account performance',
        'Per-account records counted once; no parent event totals added.',
        s.accounts.map((a) => ({
          accountId: a.id,
          name: a.nickname,
          stage: a.stage,
          ...summary(results.filter((r) => r.accountId === a.id)),
        })),
      ),
      table(
        'Copy group performance',
        'Historical event membership; sums existing account-level results only, including negative days.',
        s.groups
          .filter((g) => !f.groupId || g.id === f.groupId)
          .map((g) => ({
            groupId: g.id,
            name: g.name,
            ...summary(
              results.filter((r) =>
                s.events.some((e) => e.id === r.copyEventId && e.groupId === g.id),
              ),
            ),
          })),
      ),
      table(
        'Trading result history',
        'Session/report date retained. Fees already included are not deducted again.',
        results.map((r) => ({
          id: r.id,
          accountId: r.accountId,
          copyEventId: r.copyEventId ?? null,
          date: tradingResultDate(r),
          profitCents: r.profitCents ?? null,
          lossCents: r.lossCents ?? null,
          feesCents: r.feesCents,
          feesIncluded: r.feesIncluded ?? false,
          netCents: r.netCents,
          sourceUpdatedAt: r.updatedAt,
        })),
      ),
      table(
        'Payout activity',
        'Requests and approvals are not income. Received deposits link one authoritative Income transaction.',
        s.payouts
          .filter(
            (p) => inRange(p.requestDate, f.from, f.to) || inRange(p.depositDate, f.from, f.to),
          )
          .map((p) => ({
            id: p.id,
            accountId: p.accountId,
            status: p.status,
            requestDate: p.requestDate,
            requestedCents: p.requestedCents,
            approvedCents: p.approvedCents,
            receivedCents: p.receivedCents,
            depositDate: p.depositDate,
            incomeTransactionId: p.incomeTransactionId,
            sourceUpdatedAt: p.updatedAt,
          })),
      ),
      table(
        'Confirmed payout income',
        'Subset of confirmed Income, not an additional income total. Account/group filters require the linked payout.',
        s.income.transactions
          .filter(
            (t) =>
              t.incomeTypeSnapshot === 'trading_payout' &&
              t.status === 'confirmed' &&
              t.tradingPayoutWithdrawn &&
              inRange(t.depositDate, f.from, f.to) &&
              t.depositDate! <= today &&
              (!(f.accountId || f.groupId) ||
                s.payouts.some(
                  (p) =>
                    p.incomeTransactionId === t.id && s.accounts.some((a) => a.id === p.accountId),
                )),
          )
          .map((t) => ({
            id: t.id,
            depositDate: t.depositDate,
            netCents: t.actualNetCents,
            confirmedAt: t.confirmedAt,
          })),
      ),
    ],
    goals: [
      table(
        'Financial goal progress',
        'Authoritative goal-period calculations through report end or today, whichever is earlier. Overlapping periods retain their full labeled target; not an additional cash balance.',
        s.goals.flatMap((g) =>
          reportWindows(g, f.from, f.to < today ? f.to : today)
            .map((w) =>
              goalProgress(
                g,
                w,
                { ...s, income: s.income.transactions },
                f.to < today ? f.to : today,
              ),
            )
            .map((p) => ({
              goalId: g.id,
              name: g.name,
              type: g.goalType,
              periodFrom: p.startDate,
              periodTo: p.endDate,
              targetCents: g.targetCents,
              actualCents: p.actualCents,
              shortfallCents: p.shortfallCents,
              overageCents: p.overageCents,
              met: p.met,
              incomplete: p.incomplete,
              source: p.source,
              sourceUpdatedAt: g.updatedAt,
            })),
        ),
      ),
    ],
  }
}
