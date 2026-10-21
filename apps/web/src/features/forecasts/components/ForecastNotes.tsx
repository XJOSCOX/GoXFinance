import { forecastNotices, type ForecastReport } from '@goxfinance/shared'

export function ForecastNotes({ report }: { report: ForecastReport }) {
  const notes = forecastNotices(report)
  if (!notes.length) return null
  const blocking = notes.filter((n) => n.severity === 'blocking').length
  return (
    <details className="rounded-lg border border-white/10 bg-white/[0.02] p-3" open={blocking > 0}>
      <summary className="cursor-pointer text-sm font-medium">
        Projection notes · {blocking ? `${blocking} unresolved` : 'assumptions & cautions'}
      </summary>
      <ul className="mt-3 space-y-2 text-xs text-slate-400">
        {notes.map((n) => (
          <li key={n.message}>
            <span
              className={
                n.severity === 'blocking'
                  ? 'text-rose-300'
                  : n.severity === 'caution'
                    ? 'text-amber-200'
                    : 'text-sky-300'
              }
            >
              {n.severity === 'blocking'
                ? 'Missing / unresolved'
                : n.severity === 'caution'
                  ? 'Caution'
                  : 'Information'}
            </span>
            {' · '}
            {n.message}
          </li>
        ))}
      </ul>
    </details>
  )
}
