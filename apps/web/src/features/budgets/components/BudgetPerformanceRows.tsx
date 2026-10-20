import type { BudgetCategoryRow, FinancialCategory } from '@goxfinance/shared'
import { categoryAppearance } from '../../categories/category-appearance'
import { formatMoney } from '../../../lib/money'

export function BudgetPerformanceRows({
  rows,
  categories,
}: {
  rows: BudgetCategoryRow[]
  categories: FinancialCategory[]
}) {
  return (
    <ul className="divide-y divide-white/[.06]">
      {rows.map((row) => {
        const { Icon, color } = categoryAppearance(
          row.name,
          categories.find((c) => c.id === row.categoryId)?.icon,
        )
        const warning =
          row.status === 'Over Budget'
            ? 'text-rose-300'
            : row.status === 'Approaching Limit' || row.status === 'At Limit'
              ? 'text-amber-200'
              : 'text-emerald-300'
        return (
          <li key={row.categoryId ?? 'uncategorized'} className="py-2">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-white/5 p-1.5" style={{ color }}>
                <Icon size={14} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs" title={row.name}>
                {row.name}
                {row.archived ? ' (archived)' : ''}
              </span>
              <span className="shrink-0 text-xs tabular-nums">
                {row.limitCents === null ? 'Not allocated' : formatMoney(row.limitCents)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2 text-[11px]">
              <span className="text-slate-400">{formatMoney(row.actualCents)} spent</span>
              <span className={row.status ? warning : 'text-slate-400'}>
                {row.status === 'Over Budget'
                  ? `${formatMoney(row.overCents)} over`
                  : row.status === 'At Limit'
                    ? 'At limit'
                    : row.limitCents !== null
                      ? `${formatMoney(row.remainingCents)} left${row.status === 'Approaching Limit' ? ' · Near limit' : ''}`
                      : 'Unbudgeted spending'}
              </span>
            </div>
            {row.percent !== null && (
              <div
                role="progressbar"
                aria-label={row.name + ' spending used'}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, row.percent)}
                aria-valuetext={row.percent.toFixed(1) + '% used'}
                className="mt-1 h-1 overflow-hidden rounded-full bg-white/10"
              >
                <div
                  className={`h-full ${row.status === 'Over Budget' ? 'bg-rose-300' : row.status === 'Approaching Limit' || row.status === 'At Limit' ? 'bg-amber-200' : 'bg-emerald-300'}`}
                  style={{ width: Math.min(100, row.percent) + '%' }}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
