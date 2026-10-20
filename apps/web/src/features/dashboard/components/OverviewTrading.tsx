import { tradingStageTotals } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { TradingProfitGroups } from '../../../components/financial/TradingProfitGroups'
import { useOverviewTrading } from '../hooks/useOverviewTrading'
export function OverviewTrading({ home, month }: { home: string; month: string }) {
  const { data, error, retry } = useOverviewTrading(home)
  const report = data ? tradingStageTotals(data.accounts, data.results, month) : null
  return (
    <Card className="min-w-0 p-4">
      <section aria-label="Trading performance">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Trading performance</h2>
          {data && (
            <span className="text-xs text-slate-500">
              {data.accounts.length} accounts · {month}
            </span>
          )}
        </div>
        {error ? (
          <div className="mt-3">
            <p role="alert" className="text-sm text-rose-300">
              Could not load trading: {error}
            </p>
            <Button size="small" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : !report ? (
          <p role="status" className="mt-3 text-xs text-slate-400">
            Loading trading totals…
          </p>
        ) : (
          <>
            <div className="mt-3">
              <TradingProfitGroups report={report} showBreakdown />
            </div>
            {!report.combine.resultCount &&
              !report.funded.resultCount &&
              !report.unclassifiedCount && (
                <p className="mt-2 text-xs text-slate-500">No results recorded for this month.</p>
              )}
          </>
        )}
        <p className="mt-3 border-t border-white/[.07] pt-2 text-xs leading-5 text-slate-500">
          Recorded session results for the reporting month. Fees shown are additional deductions
          only; fee-adjusted P&L is not charged again. Net = profit − loss − fees when the breakdown
          is known. Not payout income or available cash; confirmed payout deposits stay in Income
          received.
        </p>
      </section>
    </Card>
  )
}
