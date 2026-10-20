import { sumCents, tradingStageTotals, type TradingData } from '@goxfinance/shared'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { amountTone } from '../../../components/ui/semantic-tones'
import { TradingProfitGroups } from '../../../components/financial/TradingProfitGroups'
import { formatMoney } from '../../../lib/money'
export function TradingSummary({ data }: { data: TradingData }) {
  const report = tradingStageTotals(data.accounts, data.results)
  const fundedIds = new Set(report.funded.accounts.map((a) => a.id))
  const payouts = [...new Map(data.payouts.map((p) => [p.id, p])).values()].filter((p) =>
    fundedIds.has(p.accountId),
  )
  return (
    <div className="mb-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat
          compact
          label="Combine P&L · simulated"
          tone={amountTone(report.combine.netCents)}
          amount={formatMoney(report.combine.netCents)}
          detail="All Combine accounts · not cash"
        />
        <SummaryStat
          compact
          label="Funded account P&L"
          tone={amountTone(report.funded.netCents)}
          amount={formatMoney(report.funded.netCents)}
          detail="XFA / LFA results · not deposited cash"
        />
        <SummaryStat
          compact
          label="Payouts requested / approved"
          tone="warning"
          amount={formatMoney(
            sumCents(
              payouts
                .filter((p) => ['requested', 'approved'].includes(p.status))
                .map((p) => p.approvedCents ?? p.requestedCents),
            ),
          )}
          detail="Outstanding activity · not cash"
        />
        <SummaryStat
          compact
          label="Payout deposits received"
          tone="positive"
          amount={formatMoney(
            sumCents(
              payouts
                .filter((p) => p.status === 'paid' && p.receiptConfirmed && p.incomeTransactionId)
                .map((p) => p.receivedCents ?? 0),
            ),
          )}
          detail="Confirmed deposits · counted once in Income"
        />
      </div>
      <TradingProfitGroups report={report} />
    </div>
  )
}
