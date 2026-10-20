import { tradingOverviewTotals } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { amountTone, toneStyles, type SemanticTone } from '../../../components/ui/semantic-tones'
import { formatMoney } from '../../../lib/money'
import { useOverviewTrading } from '../hooks/useOverviewTrading'
export function OverviewTrading({ home, month }: { home: string; month: string }) {
  const { data, error, retry } = useOverviewTrading(home)
  const totals = data ? tradingOverviewTotals(data.results, month) : null
  const values: [string, number | null, SemanticTone][] = totals
    ? [
        ['Total profit', totals.profitCents, 'positive'],
        ['Total loss', totals.lossCents, 'negative'],
        ['Additional fees', totals.feesCents, 'warning'],
        ['Combined net', totals.netCents, amountTone(totals.netCents)],
      ]
    : []
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
        {data?.accounts.some((a) => a.stage === 'combine') && (
          <p className="mt-2 text-xs text-slate-400">
            Includes simulated Combine results — excluded from cash and income.
          </p>
        )}
        {error ? (
          <div className="mt-3">
            <p role="alert" className="text-sm text-rose-300">
              Could not load trading: {error}
            </p>
            <Button size="small" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : !totals ? (
          <p role="status" className="mt-3 text-xs text-slate-400">
            Loading trading totals…
          </p>
        ) : (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              {values.map(([label, cents, tone]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-400">
                    {label}
                    {totals.missingBreakdownCount && ['Total profit', 'Total loss'].includes(label)
                      ? ' (known)'
                      : ''}
                  </dt>
                  <dd
                    className={`mt-1 text-lg font-semibold tabular-nums ${toneStyles[cents == null ? 'neutral' : tone].text}`}
                  >
                    {formatMoney(cents)}
                  </dd>
                </div>
              ))}
            </dl>
            {!totals.resultCount && (
              <p className="mt-2 text-xs text-slate-500">No results recorded for this month.</p>
            )}
            {totals.missingBreakdownCount > 0 && (
              <p className="mt-2 text-xs text-amber-200">
                {totals.missingBreakdownCount} results have no separate profit/loss breakdown. Fees
                and net include them; profit/loss show only entered breakdowns.
              </p>
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
