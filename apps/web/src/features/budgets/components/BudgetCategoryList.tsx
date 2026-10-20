import type { BudgetCategoryRow } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { toneStyles } from '../../../components/ui/semantic-tones'
export function BudgetCategoryList({ rows }: { rows: BudgetCategoryRow[] }) {
  const alerts = rows.filter((r) => r.status && r.status !== 'Within Budget')
  return (
    <>
      <section aria-label="Budget alerts" aria-live="polite" className="mb-3">
        {alerts.length > 0 && (
          <Card className="space-y-1 border-amber-300/20 p-3">
            <h2 className="text-sm font-semibold">Budget alerts · {alerts.length}</h2>
            {alerts.map((r) => (
              <p key={r.categoryId} className="text-xs text-amber-200">
                {r.name}: {r.status}
                {r.overCents ? ` · ${formatMoney(r.overCents)} over` : ''}
              </p>
            ))}
          </Card>
        )}
      </section>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {rows.map((r) => {
          const tone =
            r.status === 'Over Budget'
              ? 'negative'
              : r.status === 'Within Budget'
                ? 'positive'
                : r.status
                  ? 'warning'
                  : 'neutral'
          return (
            <Card key={r.categoryId ?? 'unknown'} className="min-w-0 p-4">
              <header className="flex flex-wrap justify-between gap-2">
                <h2 className="font-medium">
                  {r.name}
                  {r.archived ? ' (archived)' : ''}
                </h2>
                <span className={`text-xs ${toneStyles[tone].text}`}>
                  {r.status ?? 'No category limit'}
                </span>
              </header>
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                <span>
                  {formatMoney(r.actualCents)} spent / {formatMoney(r.limitCents)} planned
                </span>
                <span>{r.percent === null ? '' : r.percent.toFixed(1) + '% used'}</span>
              </div>
              {r.percent !== null && (
                <div
                  role="progressbar"
                  aria-label={r.name + ' budget used'}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, r.percent)}
                  aria-valuetext={r.percent.toFixed(1) + '% used'}
                  className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
                >
                  <div
                    className={`h-full ${toneStyles[tone].bar}`}
                    style={{ width: Math.min(100, r.percent) + '%' }}
                  />
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Remaining: {formatMoney(r.remainingCents)} · Over budget: {formatMoney(r.overCents)}
              </p>
            </Card>
          )
        })}
      </div>
      {!rows.length && (
        <Card className="p-8 text-center text-sm text-slate-400">
          No category limits or recorded spending for this month.
        </Card>
      )}
    </>
  )
}
