import { Link } from 'react-router-dom'
import { Lightbulb, ArrowUpRight } from 'lucide-react'
import { Card } from '../../components/ui'
import { useInsights } from './useInsights'
export function OverviewInsights({ home }: { home: string }) {
  const { data, error } = useInsights(home)
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb size={16} className="text-amber-200" />
          Financial insights
        </h2>
        <Link className="text-xs text-sky-300" to={`/households/${home}/insights`}>
          Explore insights
        </Link>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-amber-200">Insights unavailable. Open Insights to retry.</p>
      ) : !data ? (
        <p role="status" className="mt-2 text-xs text-slate-400">
          Evaluating recorded activity…
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-500">
            Current assessment · {new Date(data.report.evaluatedAt).toLocaleDateString()}
            {data.report.privacyLimited ? ' · Your authorized records' : ''}
          </p>
          <ul className="mt-2 divide-y divide-white/5">
            {data.report.insights
              .filter(
                (i, n, all) =>
                  !i.type.startsWith('cash_') ||
                  all.findIndex((x) => x.type.startsWith('cash_')) === n,
              )
              .slice(0, 3)
              .map((i) => (
                <li key={i.id}>
                  <Link
                    to={`/households/${home}/insights?insight=${encodeURIComponent(i.id)}`}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="min-w-0 break-words">{i.title}</span>
                    <ArrowUpRight size={14} className="shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
          </ul>
          {!data.report.insights.length && (
            <p className="mt-2 text-sm text-slate-400">
              More recorded history is needed for useful recommendations.
            </p>
          )}
        </>
      )}
    </Card>
  )
}
