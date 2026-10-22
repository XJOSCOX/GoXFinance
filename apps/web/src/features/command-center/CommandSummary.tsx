import type { CommandCenter } from '@goxfinance/shared'
import { Wallet, CalendarClock, ShieldCheck, Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatMoney as money } from '../../lib/money'
export function CommandSummary({ data: d }: { data: CommandCenter }) {
  const essential = d.essential.find((e) => e.days === 14)!
  return (
    <section
      aria-label="Financial status"
      className="grid gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4"
    >
      <div className="surface-card rounded-xl border border-white/10 p-4">
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Wallet size={15} />
          Available cash
        </p>
        <p className="mt-2 text-2xl font-semibold text-emerald-300">{money(d.cash.amountCents)}</p>
        <p className="mt-1 text-xs text-slate-400">
          {d.cash.status === 'reported'
            ? 'User reported · not live bank verified'
            : d.cash.status === 'stale'
              ? 'Stale · needs confirmation'
              : 'Needs confirmation'}
        </p>
        {d.cash.effectiveAt && (
          <p className="mt-1 text-xs text-slate-400">
            As of{' '}
            {new Date(d.cash.effectiveAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        )}
        <details className="mt-2 text-xs text-slate-400">
          <summary className="cursor-pointer">Cash source & date</summary>
          <p className="mt-2">
            {d.cash.effectiveAt
              ? new Date(d.cash.effectiveAt).toLocaleString()
              : 'No cash snapshot'}
          </p>
          <p>{d.cash.source?.replaceAll('_', ' ')}</p>
          <p>{d.cash.explanation}</p>
          {d.cash.status !== 'reported' && d.cash.lastReportedCents !== null && (
            <p>Last reported: {money(d.cash.lastReportedCents)}</p>
          )}
        </details>
      </div>
      <div className="surface-card rounded-xl border border-white/10 p-4">
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <CalendarClock size={15} />
          Next paycheck · conditional
        </p>
        <p className="mt-2 text-2xl font-semibold text-sky-300">
          {d.paycheck ? money(d.paycheck.netCents) : 'Not reported'}
        </p>
        {d.paycheck ? (
          <>
            <Link
              className="mt-1 block truncate text-sm hover:underline"
              to={d.paycheck.destination}
            >
              {d.paycheck.employer}
            </Link>
            <p className="mt-1 text-xs text-slate-400">
              {d.paycheck.date} ·{' '}
              {d.paycheck.status === 'reviewed' ? 'Paystub reviewed' : 'Estimate'} · not received
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-slate-400">Report a work period or upload a paycheck.</p>
        )}
      </div>
      <div className="surface-card rounded-xl border border-white/10 p-4">
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck size={15} />
          Essential obligations · 14 days
        </p>
        <p className="mt-2 text-2xl font-semibold text-amber-200">{money(essential.knownCents)}</p>
        <p className="mt-1 text-xs text-slate-400">
          {essential.count} obligations · {essential.unknownCount} unknown amounts
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Next 7 days: {money(d.essential.find((e) => e.days === 7)!.knownCents)}
        </p>
      </div>
      <div className="surface-card rounded-xl border border-white/10 p-4">
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Activity size={15} />
          Projected cash · through {d.projection.through}
        </p>
        <p className="mt-2 text-2xl font-semibold">{money(d.projection.lowestCents)}</p>
        <p className="mt-1 text-xs text-slate-400">
          Lowest · ending {money(d.projection.endingCents)}
        </p>
        <details className="mt-2 text-xs text-slate-400">
          <summary className="cursor-pointer">Buffer & funding</summary>
          <p className="mt-2">
            Buffer: {money(d.projection.bufferCents)} · reserved:{' '}
            {money(d.projection.reservedCents)}
          </p>
          <p>
            Unfunded: {money(d.projection.gapCents)} · {d.projection.unknownCount} unresolved
            amounts
          </p>
          <p>
            {d.projection.incomplete
              ? 'Needs confirmation or missing source information.'
              : d.projection.status.replaceAll('_', ' ')}
          </p>
        </details>
      </div>
    </section>
  )
}
