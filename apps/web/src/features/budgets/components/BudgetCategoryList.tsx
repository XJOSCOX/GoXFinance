import type { BudgetCategoryRow, FinancialCategory } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { toneStyles } from '../../../components/ui/semantic-tones'
import { categoryAppearance } from '../../categories/category-appearance'
import { InfoHint } from '../../../components/ui/InfoHint'
export function BudgetCategoryList({
  rows,
  categories = [],
}: {
  rows: BudgetCategoryRow[]
  categories?: FinancialCategory[]
}) {
  const alerts = rows.filter((r) => r.status && r.status !== 'Within Budget')
  return (
    <>
      <section aria-label="Budget alerts" aria-live="polite" className="mb-3">
        {alerts.length > 0 && (
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-1 border-amber-300/20 px-3 py-2">
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
      <Card className="divide-y divide-white/[.07]">
        {rows.map((r) => {
          const { Icon, color } = categoryAppearance(
            r.name,
            categories.find((c) => c.id === r.categoryId)?.icon,
          )
          const tone =
            r.status === 'Over Budget'
              ? 'negative'
              : r.status === 'Within Budget'
                ? 'positive'
                : r.status
                  ? 'warning'
                  : 'neutral'
          return (
            <article
              key={r.categoryId ?? 'unknown'}
              className="grid min-w-0 items-center gap-3 p-4 md:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1.2fr)_auto]"
            >
              <header className="flex min-w-0 items-center gap-3">
                <span className="rounded-lg bg-white/[.04] p-2" style={{ color }}>
                  <Icon size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-medium">
                    {r.name}
                    {r.archived ? ' (archived)' : ''}
                  </h2>
                  <span className={`text-xs ${toneStyles[tone].text}`}>
                    {r.status ?? 'No category limit'}
                  </span>
                </div>
              </header>
              <div>
                <div className="flex flex-wrap justify-between gap-2 text-xs">
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
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
                  >
                    <div
                      className={`h-full ${toneStyles[tone].bar}`}
                      style={{ width: Math.min(100, r.percent) + '%' }}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm tabular-nums md:justify-end">
                <span className={r.overCents ? toneStyles.negative.text : 'text-slate-300'}>
                  {r.overCents
                    ? formatMoney(r.overCents) + ' over'
                    : r.remainingCents === null
                      ? 'No limit'
                      : formatMoney(r.remainingCents) + ' left'}
                </span>
                <InfoHint
                  label={`${r.name}: budget details`}
                  text={`Remaining: ${formatMoney(r.remainingCents)}. Over budget: ${formatMoney(r.overCents)}. Category allocations are plans, not amounts spent.`}
                />
              </div>
            </article>
          )
        })}
      </Card>
      {!rows.length && (
        <Card className="p-8 text-center text-sm text-slate-400">
          No category limits or recorded spending for this month.
        </Card>
      )}
    </>
  )
}
