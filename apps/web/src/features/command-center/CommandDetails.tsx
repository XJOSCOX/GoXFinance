import type { CommandCenter } from '@goxfinance/shared'
import { Link } from 'react-router-dom'
import { formatMoney as money } from '../../lib/money'
export function PaycheckFunding({ data: d, home }: { data: CommandCenter; home: string }) {
  const p = d.paycheck,
    a = d.allocation
  return (
    <section className="surface-card min-w-0 rounded-xl border border-white/10 p-4">
      <div className="flex justify-between gap-3">
        <h2 className="font-semibold">Paycheck funding</h2>
        <Link to={`/households/${home}/planner`} className="text-xs text-sky-300 hover:underline">
          Adjust in Planner
        </Link>
      </div>
      {p ? (
        <>
          <p className="mt-3 text-sm">
            {p.employer} · {p.date}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400">Expected take-home</p>
              <p className="mt-1 text-xl text-sky-300">{money(p.netCents)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Expected gross</p>
              <p className="mt-1 text-xl">{money(p.grossCents)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            {p.periodStart && p.periodEnd ? `${p.periodStart} – ${p.periodEnd} · ` : ''}
            {p.workedHundredths === null
              ? 'Hours not reported'
              : `${(p.workedHundredths / 100).toFixed(2)} hours`}{' '}
            · {p.confidence}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {p.status === 'reviewed'
              ? 'Reviewed statement; deposit unconfirmed.'
              : 'Saved forecast; amount remains conditional.'}
          </p>
          <details
            className="mt-4 border-t border-white/5 pt-3"
            open={d.preferences.expanded.includes('allocations')}
          >
            <summary className="cursor-pointer text-sm">
              Conditional allocations ·{' '}
              {a.amountCents === null ? 'Needs information' : money(a.allocatedCents)}
            </summary>
            <div className="mt-2 space-y-2">
              {a.rows.map((r) => (
                <div key={r.id} className="flex justify-between gap-3 text-xs">
                  <span className="min-w-0 break-words">
                    {r.name} · {r.priority}
                  </span>
                  <span className="shrink-0">{money(r.amountCents)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Held for reserves: {money(a.heldCents)} · remaining conditional:{' '}
              {money(a.remainingCents)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Suggestions only. Funds are not received and no obligation is marked paid.
            </p>
          </details>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-400">
          No future payroll period has been reported. Report hours or upload a paystub to see
          conditional funding.
        </p>
      )}
    </section>
  )
}
export function CommandTimeline({ data: d }: { data: CommandCenter }) {
  return (
    <details
      className="surface-card rounded-xl border border-white/10 p-4"
      open={d.preferences.expanded.includes('timeline')}
    >
      <summary className="cursor-pointer font-semibold">
        Financial timeline · next {d.preferences.periodDays} days
      </summary>
      <p className="mt-2 text-xs text-slate-400">
        Daily totals do not establish payment order within a day.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {d.timeline.slice(0, d.preferences.periodDays).map((day) => (
          <details
            key={day.date}
            className={`min-w-0 rounded-lg border p-3 ${day.belowBuffer ? 'border-rose-400/30' : 'border-white/5'}`}
          >
            <summary className="cursor-pointer text-xs">
              <span className="font-medium">{day.date}</span>
              <span className="ml-2 text-slate-400">
                {day.events.length} events · {money(day.cashCents)}
              </span>
              {day.belowBuffer && (
                <span className="mt-1 block text-rose-300">Below safety buffer</span>
              )}
            </summary>
            {day.events.map((e) => (
              <Link key={e.id} to={e.destination} className="mt-3 block text-xs hover:underline">
                <span className="break-words">{e.name}</span>
                <span
                  className={`mt-1 block ${e.direction === 'in' ? 'text-sky-300' : 'text-amber-200'}`}
                >
                  {e.direction === 'in' ? '+' : '−'}
                  {money(e.amountCents)} · {e.status}
                </span>
              </Link>
            ))}
            {!day.events.length && (
              <p className="mt-2 text-xs text-slate-400">No recorded events.</p>
            )}
          </details>
        ))}
      </div>
    </details>
  )
}
export function CommandProgress({ data: d, home }: { data: CommandCenter; home: string }) {
  return (
    <details
      className="surface-card rounded-xl border border-white/10 p-4"
      open={d.preferences.expanded.includes('progress')}
    >
      <summary className="cursor-pointer font-semibold">Financial progress</summary>
      <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {d.preferences.indicators.includes('income') && (
          <div>
            <Link className="text-sm font-medium hover:underline" to={`/households/${home}/income`}>
              Income & cash activity
            </Link>
            <p className="mt-2 text-xs text-slate-400">
              {d.month}: {money(d.accounting.receivedCents)} received ·{' '}
              {d.accounting.confirmedCount} deposits
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Cash paid {money(d.accounting.cashPaidCents)} · net cash flow{' '}
              {money(d.accounting.netCashFlowCents)}
            </p>
            <p className="mt-2 text-xs text-sky-300">
              Expected through {d.projection.through}: {money(d.accounting.expectedCents)}
              {d.accounting.expectedUnknownCount > 0
                ? ` (${d.accounting.expectedUnknownCount} unknown; known subtotal ${money(d.accounting.knownExpectedCents)})`
                : ''}{' '}
              · conditional
            </p>
          </div>
        )}
        {d.preferences.indicators.includes('budget') && (
          <div>
            <Link
              className="text-sm font-medium hover:underline"
              to={`/households/${home}/budgets`}
            >
              Budget · {d.month}
            </Link>
            <p className="mt-2 text-xs text-slate-400">
              Allocation {money(d.budget.allocationCents)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Assigned {money(d.budget.assignedCents)} · unallocated{' '}
              {money(d.budget.unallocatedCents)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Actual spending {money(d.budget.actualCents)}
            </p>
          </div>
        )}
        <div>
          <p className="text-sm font-medium">Essential funding · planning window</p>
          <p className="mt-2 text-xs text-slate-400">
            Funded {money(d.projection.fundedEssentialCents)} · unfunded{' '}
            {money(d.projection.unfundedEssentialCents)}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {d.projection.unknownCount} unknown obligations · conditional funds may be included.
          </p>
          <Link
            className="mt-2 block text-xs text-sky-300"
            to={`/households/${home}/planner?action=cash`}
          >
            Review safety buffer
          </Link>
        </div>
        {d.preferences.indicators.includes('goals') && (
          <div>
            <Link className="text-sm font-medium hover:underline" to={`/households/${home}/goals`}>
              Active goals
            </Link>
            {d.goals.map((g) => (
              <div key={g.id} className="mt-3 text-xs">
                <p>{g.name}</p>
                <p className="mt-1 text-slate-400">
                  {money(g.actualCents)} / {money(g.targetCents)} · {g.source}
                  {g.incomplete ? ' · incomplete' : ''}
                </p>
              </div>
            ))}
            {!d.goals.length && <p className="mt-2 text-xs text-slate-400">No active goals.</p>}
          </div>
        )}
        {d.preferences.indicators.includes('debt') && (
          <div>
            <Link
              className="text-sm font-medium hover:underline"
              to={`/households/${home}/insights`}
            >
              Verified debt changes
            </Link>
            {d.debtChanges.map((c) => (
              <Link key={c.id} className="mt-3 block text-xs hover:underline" to={c.destination}>
                {c.name}
                <span className="mt-1 block text-slate-400">
                  {c.from} – {c.through}: {money(c.previousCents)} → {money(c.currentCents)}
                </span>
              </Link>
            ))}
            {!d.debtChanges.length && (
              <p className="mt-2 text-xs text-slate-400">
                Two dated verified observations are needed. Payments alone do not establish a new
                balance.
              </p>
            )}
          </div>
        )}
      </div>
    </details>
  )
}
