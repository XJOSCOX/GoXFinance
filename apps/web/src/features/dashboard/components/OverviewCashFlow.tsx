import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import type { ForecastReport } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { apiRequest, errorMessage } from '../../../lib/api'
import { formatMoney } from '../../../lib/money'

export function OverviewCashFlow({ home }: { home: string }) {
  const [report, setReport] = useState<ForecastReport | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const refresh = () => {
      void apiRequest<{ report: ForecastReport }>(`households/${home}/forecasts/smart?days=30`)
        .then((result) => {
          if (active) {
            setReport(result.report)
            setError('')
          }
        })
        .catch((failure) => {
          if (active) setError(errorMessage(failure))
        })
    }
    refresh()
    const timer = setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [home])
  const smart = report?.smart,
    first = report?.shortfalls[0]
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock size={16} className="text-sky-300" />
          Smart cash flow <span className="text-xs font-normal text-slate-500">Next 30 days</span>
        </h2>
        <Link to={`/households/${home}/forecasts`} className="text-xs text-sky-300">
          View forecast
        </Link>
      </div>
      {error ? (
        <p role="status" className="mt-2 text-xs text-amber-200">
          Forecast unavailable: {error}
        </p>
      ) : !smart ? (
        <p className="mt-2 text-xs text-slate-400">Loading cash flow…</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs lg:grid-cols-4">
            <div>
              <dt className="text-slate-400">Next expected paycheck</dt>
              <dd className="mt-1 font-semibold">
                {formatMoney(smart.nextPaycheck?.amountCents ?? null)}{' '}
                <span className="font-normal text-slate-500">
                  {smart.nextPaycheck?.date ?? 'Date unknown'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Obligations before payday</dt>
              <dd className="mt-1 font-semibold">
                {formatMoney(smart.billsBeforePaydayCents)}
                {smart.unknownBeforePayday ? ' + unknown' : ''}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Potential shortfall / buffer</dt>
              <dd
                className={`mt-1 ${first || smart.daysBelowBuffer ? 'text-amber-200' : 'text-slate-300'}`}
              >
                {first
                  ? `${formatMoney(first.amountCents)} · ${first.date}`
                  : smart.daysBelowBuffer
                    ? `${smart.daysBelowBuffer} days below buffer`
                    : report?.incomplete
                      ? 'Assessment incomplete'
                      : 'Within current plan'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Forecast status</dt>
              <dd className="mt-1 capitalize">{smart.health.replaceAll('_', ' ')}</dd>
            </div>
          </dl>
          {smart.openingRequired && (
            <p className="mt-2 text-xs text-amber-200">
              Opening cash balance required for a complete cash projection.
            </p>
          )}
        </>
      )}
    </Card>
  )
}
