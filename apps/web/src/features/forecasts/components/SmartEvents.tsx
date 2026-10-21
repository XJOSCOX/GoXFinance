import { Link } from 'react-router-dom'
import type { ForecastEvent, ForecastReport } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'

function sourceLink(home: string, event: ForecastEvent) {
  const ref = event.reference
  if (!ref || ref.type === 'scenario' || ref.type === 'refund') return null
  if (ref.type === 'planner')
    return `/households/${home}/planner?record=${encodeURIComponent(ref.id)}`
  const page = ['income', 'payroll'].includes(ref.type)
    ? 'income'
    : ['bill', 'bill_payment'].includes(ref.type)
      ? 'bills'
      : ref.type === 'expense'
        ? 'expenses'
        : 'debts'
  const key =
    ref.type === 'payroll'
      ? 'payroll'
      : event.classification === 'assumed_income'
        ? 'source'
        : 'record'
  return `/households/${home}/${page}?${key}=${encodeURIComponent(ref.parentId ?? ref.id)}`
}
export function SmartEvents({ home, report }: { home: string; report: ForecastReport }) {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="font-semibold">Upcoming events & calculation basis</h2>
      <p className="mt-1 text-xs text-slate-400">
        Projected payments do not change real due dates or satisfy creditor obligations.
      </p>
      <div className="mt-3 max-h-96 divide-y divide-white/10 overflow-auto">
        {!report.events.length && (
          <p className="py-4 text-sm text-slate-400">
            No known events in this range. Unreported income and expenses are not invented.
          </p>
        )}
        {report.events.map((event) => {
          const link = sourceLink(home, event)
          return (
            <details key={event.id} className="py-3 text-sm">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="mr-3 text-xs text-slate-400">{event.date}</span>
                  {event.name}
                  <span className="mt-1 block text-xs capitalize text-slate-500">
                    {event.classification?.replaceAll('_', ' ') ?? event.kind}
                  </span>
                </span>
                <strong
                  className={`tabular-nums ${event.amountCents === null ? 'text-amber-200' : event.direction === 'in' ? 'text-emerald-300' : 'text-slate-200'}`}
                >
                  {event.amountCents === null
                    ? 'Unknown amount'
                    : `${event.direction === 'in' ? '+' : '−'}${formatMoney(event.amountCents)}`}
                </strong>
              </summary>
              <div className="mt-3 space-y-2 border-l border-white/10 pl-4 text-xs text-slate-400">
                <p>{event.basis}</p>
                <p>
                  Confidence: {event.confidence ?? 'unknown'}
                  {event.originalDate
                    ? ` · Original date ${event.originalDate}`
                    : event.originalDate === null
                      ? ' · Original date unknown'
                      : ''}
                </p>
                {event.workPeriod && (
                  <p>
                    Work period {event.workPeriod.start} – {event.workPeriod.end} · Gross{' '}
                    {formatMoney(event.grossCents ?? null)} · Net cash{' '}
                    {formatMoney(event.amountCents)}
                  </p>
                )}
                {(event.modelVersion !== undefined || event.sampleCount !== undefined) && (
                  <p>
                    Forecast model {event.modelVersion ?? 'explicit assumption'} · Historical sample
                    count {event.sampleCount ?? 'unknown'}
                  </p>
                )}
                {link && (
                  <Link to={link} className="inline-block text-sky-300 underline">
                    Open source record
                  </Link>
                )}
              </div>
            </details>
          )
        })}
      </div>
    </Card>
  )
}
