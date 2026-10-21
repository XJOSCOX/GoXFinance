import { useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Lightbulb, RefreshCw, ShieldCheck } from 'lucide-react'
import type { Insight, InsightInteractionInput, InsightPlan } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../components/ui'
import { useInsights } from './useInsights'
import { apiRequest, errorMessage } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { InsightCard } from './InsightCard'
import { InsightPlanModal } from './InsightPlanModal'
const tabs = ['Overview', 'Spending', 'Income', 'Debt', 'Cash flow', 'Action plans']
export function InsightsPage() {
  const { householdId: home = '' } = useParams(),
    [search] = useSearchParams(),
    { data, error, refresh } = useInsights(home),
    [tab, setTab] = useState('Overview'),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [selected, setSelected] = useState<{ home: string; insight: Insight } | null>(null),
    [audit, setAudit] = useState<string[]>([])
  async function save(values: InsightInteractionInput, revision: number) {
    if (!data) return
    setBusy(true)
    setFailure('')
    try {
      await apiRequest(`households/${home}/insights/actions`, {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          fingerprint: data.fingerprint,
          revision,
          values,
        }),
      })
      refresh()
      return true
    } catch (e) {
      setFailure(errorMessage(e))
      refresh()
      return false
    } finally {
      setBusy(false)
    }
  }
  const filtered =
      data?.report.insights.filter(
        (i) => tab === 'Overview' || i.area === tab.toLowerCase().replace(' ', '_'),
      ) ?? [],
    focus = search.get('insight')
  const visible = [...filtered].sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0))
  return (
    <WorkspaceLayout title="Financial insights">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Lightbulb size={23} className="text-amber-200" />
            Financial insights
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            What changed, what needs attention, and the evidence behind it.
          </p>
        </div>
        <Button variant="secondary" size="small" onClick={refresh}>
          <RefreshCw size={14} />
          Reevaluate
        </Button>
      </header>
      {error ? (
        <Card className="p-5">
          <p role="alert" className="text-rose-300">
            {error}
          </p>
          <Button className="mt-3" onClick={refresh}>
            Retry
          </Button>
        </Card>
      ) : !data ? (
        <p role="status">Evaluating authorized financial records…</p>
      ) : (
        <>
          <Card className="mb-4 border-sky-300/15 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck size={16} className="text-sky-300" />
                  {data.report.status === 'pressure'
                    ? 'Review current financial pressure'
                    : data.report.status === 'needs_information'
                      ? 'Some indicators need more information'
                      : 'Within the observed plan'}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Evaluated {new Date(data.report.evaluatedAt).toLocaleDateString()} · No composite
                  score ·{' '}
                  {data.report.privacyLimited ? 'Your authorized scope' : 'Household records'}
                </p>
              </div>
              <span className="text-xs text-slate-500">Local, explainable calculations</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {data.report.metrics
                .filter((m) =>
                  [
                    'confirmed_income',
                    'essential_obligations',
                    'debt_minimums',
                    'cash_floor',
                  ].includes(m.key),
                )
                .map((m) => (
                  <div key={m.key} className="min-w-0">
                    <p className="text-xs text-slate-400">{m.label}</p>
                    <p className="mt-1 text-lg font-semibold">{formatMoney(m.value)}</p>
                  </div>
                ))}
            </div>
            <details className="mt-4 border-t border-white/5 pt-3 text-xs">
              <summary className="cursor-pointer text-slate-400">
                All indicators & data coverage
              </summary>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.report.metrics.map((m) => (
                  <div key={m.key} className="rounded-lg bg-white/[.02] p-3">
                    <dt className="text-slate-400">{m.label}</dt>
                    <dd className="mt-1 font-semibold">
                      {m.value === null
                        ? 'Unknown'
                        : m.unit === 'cents'
                          ? formatMoney(m.value)
                          : m.unit === 'bps'
                            ? `${(m.value / 100).toFixed(2)}%`
                            : `${m.value} days`}
                    </dd>
                    <dd className="mt-2 leading-relaxed text-slate-500">
                      {m.basis} · {m.sampleCount} observations
                    </dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-3 list-inside list-disc space-y-1 text-slate-500">
                {data.report.coverage.map((v, n) => (
                  <li key={n}>{v}</li>
                ))}
              </ul>
            </details>
          </Card>
          <nav
            aria-label="Insight sections"
            className="mb-4 flex gap-1 overflow-x-auto border-b border-white/10"
          >
            {tabs.map((t) => (
              <button
                key={t}
                aria-current={tab === t ? 'page' : undefined}
                className={`min-h-11 shrink-0 border-b-2 px-3 text-sm ${tab === t ? 'border-[#adbcad] text-white' : 'border-transparent text-slate-400'}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
          {!data.canManage && (
            <p className="mb-3 text-xs text-slate-400">
              Read-only access. Only authorized members can save feedback or action plans.
            </p>
          )}
          {failure && (
            <p role="alert" className="mb-3 text-sm text-rose-300">
              {failure}
            </p>
          )}
          {tab === 'Action plans' ? (
            <div className="space-y-3">
              {!data.plans.length && (
                <Card className="p-6 text-sm text-slate-400">
                  No action plans yet. Review an insight to create a plan.
                </Card>
              )}
              {data.plans.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-semibold">{p.insight.title}</h2>
                    <label className="text-xs text-slate-400">
                      Plan status{' '}
                      <select
                        aria-label={`Status: ${p.insight.title}`}
                        className="ml-2 rounded-md border border-white/10 bg-[#171a18] p-2"
                        value={p.values.status}
                        disabled={busy || !data.canManage}
                        onChange={(e) =>
                          void save(
                            {
                              ...p.values,
                              status: e.target.value as InsightPlan['values']['status'],
                            },
                            p.revision,
                          )
                        }
                      >
                        {['planned', 'in_progress', 'completed', 'dismissed'].map((s) => (
                          <option key={s} value={s}>
                            {s.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {p.values.startDate} – {p.values.endDate} · Accepted {p.createdAt.slice(0, 10)}
                    {p.stale ? ' · Source data changed; saved scenario is historical' : ''}
                  </p>
                  <p className="mt-3 text-sm">
                    {p.insight.categoryId
                      ? 'New recorded category spending: '
                      : 'Review-only plan: '}
                    {p.insight.categoryId
                      ? formatMoney(p.observedSpendingCents)
                      : 'no spending target'}{' '}
                    · {p.observedCount} observations
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Achieved savings: unverified. Plan status does not prove money saved. Only
                    activity recorded after acceptance is tracked.
                  </p>
                  {p.scenario && (
                    <p className="mt-2 text-sm text-sky-200">
                      Saved hypothetical minimum: {formatMoney(p.scenario.baseline.lowestCents)} →{' '}
                      {formatMoney(p.scenario.proposed.lowestCents)} · Impact{' '}
                      {formatMoney(p.scenario.improvementCents)}
                    </p>
                  )}
                  {p.values.notes && (
                    <p className="mt-3 break-words text-sm text-slate-400">{p.values.notes}</p>
                  )}
                  <button
                    className="mt-3 min-h-9 text-xs text-sky-300"
                    onClick={() => {
                      void apiRequest<{
                        history: {
                          createdAt: string
                          details: { after: { valuesJson: string; revision: number } }
                        }[]
                      }>(`households/${home}/insights/actions/${p.id}/audit`)
                        .then((v) =>
                          setAudit(
                            v.history.map((event) => {
                              const values = JSON.parse(
                                event.details.after.valuesJson,
                              ) as InsightInteractionInput
                              return `${new Date(event.createdAt).toLocaleString()} · Revision ${event.details.after.revision} · ${values.status.replaceAll('_', ' ')}`
                            }),
                          ),
                        )
                        .catch((e) => setFailure(errorMessage(e)))
                    }}
                  >
                    View audit history
                  </button>
                </Card>
              ))}
              {audit.length > 0 && (
                <details
                  open
                  className="rounded-lg border border-white/10 p-4 text-xs text-slate-400"
                >
                  <summary className="cursor-pointer">Immutable plan history</summary>
                  <ul className="mt-3 space-y-2">
                    {audit.map((row, n) => (
                      <li key={n}>{row}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <>
              <div className="grid items-start gap-3 xl:grid-cols-2">
                {(tab === 'Overview' ? visible.slice(0, 6) : visible).map((i) => (
                  <InsightCard
                    key={i.id}
                    insight={i}
                    home={home}
                    canManage={data.canManage}
                    canPlan={!data.plans.some((p) => p.values.insightId === i.id)}
                    busy={busy}
                    onFeedback={(i, status) =>
                      void save(
                        { kind: 'feedback', insightId: i.id, status },
                        i.feedbackRevision ?? 0,
                      )
                    }
                    onPlan={(insight) => setSelected({ home, insight })}
                  />
                ))}
              </div>
              {!visible.length && (
                <Card className="p-6">
                  <p className="text-sm text-slate-400">
                    No supported insights in this section yet. Missing records are not treated as
                    zero activity.
                  </p>
                </Card>
              )}
              {tab === 'Overview' && visible.length > 6 && (
                <p className="mt-4 text-xs text-slate-400">
                  Showing the six highest-priority insights. Choose a section to explore all
                  evidence.
                </p>
              )}
            </>
          )}
          <p className="mt-6 text-xs text-slate-500">
            Keep confirmed activity separate from plans.{' '}
            <Link className="text-sky-300" to={`/households/${home}/planner`}>
              Open Smart Planner
            </Link>
          </p>
          {selected && selected.home === home && (
            <InsightPlanModal
              key={`${home}:${selected.insight.id}`}
              home={home}
              data={data}
              insight={selected.insight}
              onClose={() => setSelected(null)}
              onSaved={refresh}
            />
          )}
        </>
      )}
    </WorkspaceLayout>
  )
}
