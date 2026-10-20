import {
  netWorth,
  debtPayoffProgress,
  settlementProgress,
  simulatePayoff,
  type ReportFilters,
} from '@goxfinance/shared'
import { table, inRange } from './report.tables'
import type { ReportSources } from './report.sources'
export function positionTables(
  s: ReportSources,
  f: ReportFilters,
  today: string,
  member: string | null,
  protectedAssetIds = new Set<string>(),
) {
  const asOf = f.to < today ? f.to : today,
    worth = netWorth(s, asOf, member, today)
  if (protectedAssetIds.size) {
    worth.incomplete = true
    worth.warnings.push(
      'Some asset-associated liabilities are outside this export permission scope; affected equity is unknown.',
    )
    for (const asset of worth.assets) if (protectedAssetIds.has(asset.id)) asset.equityCents = null
  }
  const progress = debtPayoffProgress(
    s.debts,
    s.balances.filter((b) => b.effectiveDate >= f.from),
    asOf,
  )
  return {
    warnings: worth.warnings,
    tables: {
      debts: [
        table(
          'Current debt account status',
          'Current corrected account attributes at generation time, not reconstructed historical status. Aliases are individual records; use the dated grouped liabilities table for totals.',
          s.debts.map((d) => ({
            id: d.id,
            creditor: d.creditorName,
            type: d.accountType,
            accountStatus: d.accountStatus,
            paymentStatus: d.paymentStatus,
            confidence: d.confidence,
            recordedBalanceCents: d.currentBalanceCents,
            minimumCents: d.minimumPaymentCents,
            aprPercent: d.interestRateApr,
            archived: d.isArchived,
            sourceUpdatedAt: d.updatedAt,
          })),
        ),
        table(
          'Debt balances as of report end',
          'Authoritative dated observations; current associations. Verified duplicate creditor links count once.',
          worth.liabilities.map((l) => ({ ...l })),
        ),
        table(
          'Debt payoff progress',
          'Balance observations within selected dates. Payments are not assumed to reduce principal.',
          progress.accounts.map((a) => ({ ...a })),
        ),
        table(
          'Debt payment history',
          'Status retained. Only completed nonfuture payments are cash outflows.',
          s.payments
            .filter((p) => inRange(p.paymentDate, f.from, f.to))
            .map((p) => ({
              id: p.id,
              debtId: p.debtId,
              date: p.paymentDate,
              status: p.paymentStatus,
              method: p.paymentMethod,
              amountCents: p.amountCents,
              principalCents: p.principalAmountCents,
              interestCents: p.interestAmountCents,
              feesCents: p.feesAmountCents,
              sourceUpdatedAt: p.updatedAt,
            })),
        ),
        table(
          'Saved payoff projections',
          'Immutable saved assumptions and debt snapshot; not actual payments.',
          s.scenarios
            .filter((r) => inRange(r.createdAt, f.from, f.to))
            .map((r) => {
              const p = simulatePayoff(r.debts, r.input)
              return {
                id: r.id,
                name: r.input.name,
                strategy: r.input.strategy,
                createdAt: r.createdAt,
                initialCents: p.initialCents,
                monthlyCents: p.monthlyCents,
                projectedInterestCents: p.interestCents,
                payoffDate: p.payoffDate,
                complete: p.complete,
              }
            }),
        ),
      ],
      settlements: [
        table(
          'Settlement offer change history',
          'Audit dates and corrected terms retained; no invitation or authentication fields.',
          s.offerHistory.filter((a) => inRange(a.createdAt, f.from, f.to)),
        ),
        table(
          'Settlement offers',
          'Current audited terms for offers overlapping selected dates. Acceptance does not settle a debt.',
          s.offers
            .filter((o) => o.offerDate <= f.to && (!o.expirationDate || o.expirationDate >= f.from))
            .map((o) => {
              const p = settlementProgress(o, s.payments, asOf)
              return {
                id: o.id,
                debtId: o.debtId,
                creditor: o.creditor,
                offerDate: o.offerDate,
                expirationDate: o.expirationDate,
                status: o.status,
                originalBalanceCents: o.originalBalanceCents,
                obligationCents: o.amountCents,
                savingsCents: p.savingsCents,
                completedPaymentsCents: p.paidCents,
                remainingCents: p.remainingCents,
                writtenConfirmed: o.writtenConfirmed,
                sourceUpdatedAt: o.updatedAt,
              }
            }),
        ),
        table(
          'Settlement installments',
          'Existing linked debt payments only; never added again to cash outflows.',
          s.offers.flatMap((o) =>
            settlementProgress(o, s.payments, asOf)
              .schedule.filter((i) => inRange(i.dueDate, f.from, f.to))
              .map((i) => ({
                offerId: o.id,
                id: i.id,
                dueDate: i.dueDate,
                obligationCents: i.amountCents,
                paidCents: i.paidCents,
                remainingCents: i.remainingCents,
                overpaidCents: i.overpaidCents,
                paymentId: i.paymentId,
                missed: i.missed,
              })),
          ),
        ),
      ],
      forecasts: [
        table(
          'Saved forecast summaries',
          'Immutable projections whose forecast window overlaps selected dates; never actual cash.',
          s.forecasts
            .filter((r) => r.input.startDate <= f.to && r.input.endDate >= f.from)
            .map((r) => ({
              id: r.id,
              name: r.input.name,
              from: r.input.startDate,
              to: r.input.endDate,
              mode: r.input.mode,
              startingCents: r.input.startingCents,
              incomeCents: r.report.incomeCents,
              outflowCents: r.report.outflowCents,
              endingCents: r.report.endingCents,
              lowestCents: r.report.lowestCents,
              incomplete: r.report.incomplete,
              createdAt: r.createdAt,
            })),
        ),
      ],
      net_worth: [
        table(
          'Net worth subtotal',
          'Known values at report end; unknowns excluded. Nominal trading balances are never assets.',
          [
            {
              asOf,
              assetsCents: worth.assetCents,
              liabilitiesCents: worth.liabilityCents,
              knownSubtotalCents: worth.subtotalCents,
              incomplete: worth.incomplete,
            },
          ],
        ),
        table(
          'Assets and equity',
          'Dated active valuations; purchase price is not a valuation.',
          worth.assets.map((a) => ({ ...a })),
        ),
        table(
          'Asset valuation history',
          'Corrections retain superseded observations.',
          s.valuations
            .filter((v) => inRange(v.valuationDate, f.from, f.to))
            .map((v) => ({
              id: v.id,
              assetId: v.assetId,
              date: v.valuationDate,
              valueCents: v.valueCents,
              source: v.source,
              confidence: v.confidence,
              supersedesId: v.supersedesId,
              createdAt: v.createdAt,
            })),
        ),
        table(
          'Captured net worth history',
          'Immutable saved snapshots in the selected member scope; no interpolated history.',
          s.snapshots
            .filter((r) => inRange(r.report.asOf, f.from, f.to))
            .map((r) => ({
              id: r.id,
              asOf: r.report.asOf,
              assetsCents: r.report.assetCents,
              liabilitiesCents: r.report.liabilityCents,
              knownSubtotalCents: r.report.subtotalCents,
              incomplete: r.report.incomplete,
              createdAt: r.createdAt,
            })),
        ),
      ],
    },
  }
}
