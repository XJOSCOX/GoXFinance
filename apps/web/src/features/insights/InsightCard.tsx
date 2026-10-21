import { Link } from 'react-router-dom'
import type { Insight } from '@goxfinance/shared'
import { Card, Button } from '../../components/ui'
import { formatMoney } from '../../lib/money'
export function InsightCard({
  insight: i,
  home,
  canManage,
  canPlan = true,
  busy,
  onFeedback,
  onPlan,
}: {
  insight: Insight
  home: string
  canManage: boolean
  canPlan?: boolean
  busy: boolean
  onFeedback: (i: Insight, status: 'useful' | 'dismissed' | 'reset') => void
  onPlan: (i: Insight) => void
}) {
  const colors = {
    urgent: 'text-rose-300 border-rose-300/20',
    important: 'text-amber-200 border-amber-200/20',
    improvement: 'text-sky-300 border-sky-300/20',
    informational: 'text-emerald-300 border-emerald-300/20',
  }
  const route = (type: string) =>
    ({
      expense: 'expenses',
      refund: 'transactions',
      settlement: 'debt-planning',
      income: 'income',
      payroll: 'income',
      bill: 'bills',
      debt: 'debts',
      debt_payment: 'debts',
      debt_balance: 'debts',
      bank_balance: 'bank-accounts',
      forecast_settings: 'forecasts',
      budget: 'budgets',
      planner: 'planner',
      goal: 'goals',
      asset: 'assets',
    })[type] ?? i.module
  return (
    <Card className="min-w-0 p-4 sm:p-5" id={`insight-${i.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className={`rounded-full border px-2 py-0.5 capitalize ${colors[i.priority]}`}>
          {i.priority}
        </span>
        <span className="text-slate-500">
          {i.confidence} confidence · {i.sampleCount}{' '}
          {i.type.startsWith('cash_') ? 'projected occurrences' : 'observations'}
        </span>
        {i.feedback === 'dismissed' && (
          <span className="text-amber-200">Dismissed · significant risk remains visible</span>
        )}
      </div>
      <h3 className="mt-3 break-words font-semibold">{i.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{i.explanation}</p>
      {(i.currentCents !== null || i.comparisonCents !== null) && (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Current / selected value</dt>
            <dd className="mt-1 font-semibold">{formatMoney(i.currentCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Comparison / cost basis</dt>
            <dd className="mt-1">{formatMoney(i.comparisonCents)}</dd>
          </div>
        </dl>
      )}
      {i.changeBps !== null && (
        <p className="mt-2 text-xs text-sky-200">
          Calculated ratio / change: {(i.changeBps / 100).toFixed(2)}% · see method
        </p>
      )}
      <details className="mt-4 border-t border-white/5 pt-3 text-xs text-slate-400">
        <summary className="cursor-pointer">Calculation & evidence</summary>
        <div className="mt-3 space-y-3 break-words">
          <p>
            {i.from} – {i.through}
          </p>
          <p>
            <strong>Method:</strong> {i.method}
          </p>
          <p>
            <strong>Suggested action:</strong> {i.action}
          </p>
          <p>
            <strong>Financial impact:</strong>{' '}
            {i.impactCents === null ? 'Unknown; no savings assumed' : formatMoney(i.impactCents)}
          </p>
          <ul className="list-inside list-disc space-y-1">
            {[...i.tradeoffs, ...i.limitations].map((v, n) => (
              <li key={n}>{v}</li>
            ))}
          </ul>
          <details>
            <summary className="cursor-pointer">Source records ({i.refs.length})</summary>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
              {i.refs.map((r, n) => (
                <li key={n}>
                  <Link
                    className="text-sky-300 underline"
                    to={`/households/${home}/${route(r.type)}`}
                  >
                    {r.type} · {r.date}
                  </Link>
                  <span className="ml-2 break-all text-slate-500">{r.id}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </details>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
        <Link className="text-sky-300" to={`/households/${home}/${i.module}`}>
          Open {i.module.replaceAll('-', ' ')}
        </Link>
        {canManage && (
          <>
            <Button
              size="small"
              variant="secondary"
              disabled={busy || !canPlan}
              onClick={() => onPlan(i)}
            >
              Create action plan
            </Button>
            <button
              className="min-h-9 px-1 text-slate-400"
              disabled={busy}
              onClick={() => onFeedback(i, i.feedback === 'useful' ? 'reset' : 'useful')}
            >
              {i.feedback === 'useful' ? 'Marked useful' : 'Useful'}
            </button>
            <button
              className="min-h-9 px-1 text-slate-400"
              disabled={busy}
              onClick={() => onFeedback(i, i.feedback === 'dismissed' ? 'reset' : 'dismissed')}
            >
              {i.feedback === 'dismissed' ? 'Reset dismissal' : 'Dismiss'}
            </button>
          </>
        )}
      </div>
    </Card>
  )
}
