import { tradingStageTotals } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { TradingProfitGroups } from '../../../components/financial/TradingProfitGroups'
import { useOverviewTrading } from '../hooks/useOverviewTrading'
import { OverviewDetails } from './OverviewDetails'
import { formatMoney } from '../../../lib/money'
import { amountTone, toneStyles } from '../../../components/ui/semantic-tones'
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
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[report.combine, report.funded].map((group) => (
                <section
                  key={group.stage}
                  aria-label={group.stage === 'combine' ? 'Combine summary' : 'Funded summary'}
                >
                  <p className="text-xs text-slate-400">
                    {group.stage === 'combine' ? 'Combine · simulated' : 'Funded P&L'}
                  </p>
                  <strong
                    className={`mt-1 block text-lg tabular-nums ${toneStyles[amountTone(group.netCents)].text}`}
                  >
                    {formatMoney(group.netCents)}
                  </strong>
                </section>
              ))}
            </div>
            <div className="mt-3">
              <OverviewDetails label="Profit, loss & account details">
                <TradingProfitGroups report={report} showBreakdown />
              </OverviewDetails>
            </div>
            {!report.combine.resultCount &&
              !report.funded.resultCount &&
              !report.unclassifiedCount && (
                <p className="mt-2 text-xs text-slate-500">No results recorded for this month.</p>
              )}
          </>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          Not payout income or available cash. Only confirmed deposits reach income.
        </p>
      </section>
    </Card>
  )
}
