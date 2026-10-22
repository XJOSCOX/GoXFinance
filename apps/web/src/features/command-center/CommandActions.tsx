import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import type { CommandCenter } from '@goxfinance/shared'
import { formatMoney as money } from '../../lib/money'
export function CommandActions({ data: d }: { data: CommandCenter }) {
  const [all, setAll] = useState(false)
  const visible =
    all || !d.preferences.compact ? d.actions : d.actions.filter((a, i) => i < 4 || a.tier === 0)
  return (
    <section
      aria-labelledby="next-actions"
      className="surface-card rounded-xl border border-white/10"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
        <h2 id="next-actions" className="font-semibold">
          What should I do next?
        </h2>
        <span className="text-xs text-slate-400">
          {d.actions.length + d.omittedActionCount} grounded actions
        </span>
      </div>
      <div className="grid lg:grid-cols-2">
        {visible.map((a) => (
          <div
            key={a.id}
            className="flex items-start gap-3 border-b border-white/5 p-4 last:border-0"
          >
            <span
              className={`mt-1 size-2 shrink-0 rounded-full ${a.tier === 0 ? 'bg-rose-400' : a.tier <= 2 ? 'bg-amber-300' : 'bg-sky-300'}`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <Link
                className="flex items-center gap-2 text-sm font-medium hover:underline"
                to={a.destination}
              >
                {a.title}
                <ArrowUpRight size={14} className="shrink-0" />
              </Link>
              <p className="mt-1 text-xs text-slate-400">
                {a.date ?? 'Review information'}
                {a.amountCents !== null && ` · ${money(a.amountCents)}`} · {a.confidence}
              </p>
              <details className="mt-2 text-xs text-slate-400" open={!d.preferences.compact}>
                <summary className="cursor-pointer">Why this matters</summary>
                <p className="mt-1">{a.explanation}</p>
                <p className="mt-1">{a.rankingReason}</p>
              </details>
            </div>
          </div>
        ))}
      </div>
      {!visible.length && (
        <p className="p-4 text-sm text-slate-400">
          Add income, bills and dated cash to build a useful plan.
        </p>
      )}
      {d.actions.length > visible.length || all ? (
        <button
          className="w-full px-4 py-3 text-left text-xs text-sky-300"
          onClick={() => setAll(!all)}
        >
          {all ? 'Show fewer actions' : 'View all actions'}
        </button>
      ) : null}
      {d.omittedActionCount > 0 && (
        <p className="px-4 pb-3 text-xs text-slate-400">
          {d.omittedActionCount} additional actions available in Smart Planner and Insights.
        </p>
      )}
    </section>
  )
}
export function CommandObligations({ data: d }: { data: CommandCenter }) {
  const [all, setAll] = useState(false)
  return (
    <section className="surface-card min-w-0 rounded-xl border border-white/10 p-4">
      <h2 className="font-semibold">Upcoming obligations</h2>
      <p className="mt-1 text-xs text-slate-400">
        Unpaid balances · planning reserves are not payments
      </p>
      {(all || !d.preferences.compact ? d.obligations : d.obligations.slice(0, 5)).map((o) => (
        <div key={o.id} className="border-b border-white/5 py-3 last:border-0">
          <div className="flex items-start justify-between gap-3">
            <Link to={o.destination} className="min-w-0 break-words text-sm hover:underline">
              {o.name}
            </Link>
            <span className="shrink-0 text-sm font-medium text-amber-200">
              {money(o.remainingCents)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Due {o.date} · {o.priority} · {o.confidence}
          </p>
          <details className="mt-2 text-xs text-slate-400">
            <summary className="cursor-pointer">Payment & funding details</summary>
            <p className="mt-1">
              Amount due {money(o.amountCents)} · paid {money(o.paidCents)}
            </p>
            <p>
              Reserved {money(o.reservedCents)} · unfunded {money(o.unfundedCents)}
            </p>
            {o.date !== o.planningDate && (
              <p>Planning date {o.planningDate}; original deadline shown above.</p>
            )}
            <p>{o.explanation}</p>
            <p>Source: {o.source.type.replaceAll('_', ' ')}</p>
          </details>
        </div>
      ))}
      {!d.obligations.length && (
        <p className="mt-3 text-sm text-slate-400">
          No unpaid obligations found in the planning window. Review Bills for missing records.
        </p>
      )}
      {d.obligations.length > 5 && (
        <button className="mt-3 text-xs text-sky-300" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : 'Show more obligations'}
        </button>
      )}
      {d.obligationCount > d.obligations.length && (
        <p className="mt-2 text-xs text-slate-400">
          Showing {d.obligations.length} of {d.obligationCount}. Open Smart Planner for the full
          list.
        </p>
      )}
    </section>
  )
}
