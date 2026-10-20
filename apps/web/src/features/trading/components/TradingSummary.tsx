import {
  sumCents,
  tradingStageTotals,
  tradingWithdrawalEstimate,
  type TradingData,
} from '@goxfinance/shared'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { amountTone } from '../../../components/ui/semantic-tones'
import { formatMoney } from '../../../lib/money'
export function TradingSummary({ data }: { data: TradingData }) {
  const report = tradingStageTotals(data.accounts, data.results)
  const fundedIds = new Set(report.funded.accounts.map((a) => a.id))
  const payouts = [...new Map(data.payouts.map((p) => [p.id, p])).values()].filter((p) =>
    fundedIds.has(p.accountId),
  )
  const received = sumCents(
    payouts
      .filter((p) => p.status === 'paid' && p.receiptConfirmed && p.incomeTransactionId)
      .map((p) => p.receivedCents ?? 0),
  )
  const outstanding = sumCents(
    payouts
      .filter((p) => ['requested', 'approved'].includes(p.status))
      .map((p) => p.approvedCents ?? p.requestedCents),
  )
  const withdrawal = tradingWithdrawalEstimate(
    data.accounts,
    data.results,
    payouts,
    new Date().toISOString(),
  )
  const combine = report.combine
  const matching =
    combine.accounts.length > 0 &&
    combine.accounts.every((a) => a.netCents === combine.accounts[0].netCents)
  return (
    <section aria-label="Trading summary" className="mb-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat
          compact
          label="Funded P&L"
          tone={amountTone(report.funded.netCents)}
          amount={formatMoney(report.funded.netCents)}
          detail="XFA / LFA · not deposited cash"
        />
        <SummaryStat
          compact
          label="Payouts received"
          tone="positive"
          amount={formatMoney(received)}
          detail={`${formatMoney(outstanding)} requested / approved · not received`}
        />
        <SummaryStat
          compact
          label="Withdrawal estimate"
          tone="info"
          amount={formatMoney(withdrawal.traderCents)}
          detail={
            withdrawal.accountCount
              ? `${withdrawal.readyCount}/${withdrawal.accountCount} meet recorded checks${withdrawal.incomplete ? ` · ${withdrawal.accountCount - withdrawal.assessedCount} need rule review` : ''}. After split; provider must confirm.`
              : 'No active funded accounts'
          }
        />
        <SummaryStat
          compact
          label="Combine P&L · simulated"
          tone={amountTone(combine.netCents)}
          amount={
            matching
              ? `${formatMoney(combine.accounts[0].netCents)} each`
              : formatMoney(combine.netCents)
          }
          detail={
            matching
              ? `${formatMoney(combine.netCents)} all ${combine.accounts.length} accounts · not cash`
              : combine.accounts.length
                ? `${combine.accounts.length} accounts · results differ · not cash`
                : 'No Combine accounts'
          }
        />
      </div>
      {report.unclassifiedCount > 0 && (
        <p role="alert" className="mt-2 text-xs text-amber-200">
          {report.unclassifiedCount} results have an unknown account stage and are excluded.
        </p>
      )}
    </section>
  )
}
