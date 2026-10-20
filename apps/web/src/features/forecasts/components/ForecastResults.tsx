import type { ForecastReport } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function ForecastResults({ report }: { report: ForecastReport }) {
  const values = report.days.map((d) => d.cashCents ?? d.netChangeCents),
    min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    points = values
      .map(
        (v, i) =>
          `${10 + (i / Math.max(1, values.length - 1)) * 580},${150 - ((v - min) / (max - min)) * 130}`,
      )
      .join(' ')
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Estimated inflows', report.incomeCents],
          ['Estimated cash requirements', report.outflowCents],
          ['Net projected change', report.netChangeCents],
          ['Projected ending cash', report.endingCents],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <strong className="mt-2 block">{formatMoney(value as number | null)}</strong>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <h2 className="font-semibold">
          {report.endingCents === null
            ? 'Known projected net change'
            : 'Projected daily cash position'}
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          {report.incomplete
            ? 'Incomplete: missing amounts are excluded from known subtotals. '
            : ''}
          Estimates, not a bank balance. Lowest complete projected cash:{' '}
          {formatMoney(report.lowestCents)}
        </p>
        <svg
          viewBox="0 0 600 170"
          role="img"
          aria-label="Daily forecast trend; exact amounts are in the timeline"
          className="mt-3 w-full"
        >
          <line
            x1="10"
            y1={150 - ((0 - min) / (max - min)) * 130}
            x2="590"
            y2={150 - ((0 - min) / (max - min)) * 130}
            stroke="#64748b"
            strokeDasharray="4 4"
          />
          <polyline points={points} fill="none" stroke="#93c5fd" strokeWidth="2" />
        </svg>
        <div className="flex justify-between text-xs text-slate-400">
          <span>{report.days[0]?.date}</span>
          <span>{report.days.at(-1)?.date}</span>
        </div>
      </Card>
      {report.warnings.length > 0 && (
        <Card className="space-y-1 p-4">
          <h2 className="font-semibold text-amber-200">Missing information</h2>
          {report.warnings.map((w) => (
            <p key={w} className="text-xs text-slate-400">
              {w}
            </p>
          ))}
        </Card>
      )}
      <Card className="p-4">
        <h2 className="font-semibold">Potential shortfalls</h2>
        {report.shortfalls.length ? (
          <ul className="mt-2 max-h-48 overflow-auto text-xs">
            {report.shortfalls.map((d) => (
              <li key={d.date} className="py-1 text-rose-300">
                {d.date} · {formatMoney(d.amountCents)} below zero
                {report.incomplete ? ' (known subtotal only)' : ''} ·{' '}
                {d.payments.join(', ') || 'Carried from prior obligations'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-400">
            {report.endingCents === null
              ? 'Starting cash or financial information is missing; a complete shortfall assessment is unavailable.'
              : 'No negative projected days under these assumptions.'}
          </p>
        )}
      </Card>
      <details className="rounded-xl border border-white/10 p-4">
        <summary className="cursor-pointer text-sm">Upcoming transactions & daily balances</summary>
        <div className="mt-3 max-h-96 space-y-3 overflow-auto">
          {report.days.map((d) => (
            <section key={d.date}>
              <h3 className="text-xs font-semibold">
                {d.date} · projected cash {formatMoney(d.cashCents)} · cumulative net change{' '}
                {formatMoney(d.netChangeCents)}
              </h3>
              {report.events
                .filter((e) => e.date === d.date)
                .map((e) => (
                  <p key={e.id} className="mt-1 text-xs text-slate-400">
                    {e.name} · {e.direction === 'in' ? '+' : '−'}
                    {formatMoney(e.amountCents)} · {e.kind} ·{' '}
                    {e.estimated ? 'Estimate' : 'Recorded'}
                    {e.grossCents !== undefined
                      ? ` · Gross wage estimate ${formatMoney(e.grossCents)} (not cash)`
                      : ''}
                  </p>
                ))}
            </section>
          ))}
        </div>
      </details>
    </div>
  )
}
