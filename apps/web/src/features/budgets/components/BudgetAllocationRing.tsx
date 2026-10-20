import type { BudgetCategoryRow } from '@goxfinance/shared'
import { categoryAppearance } from '../../categories/category-appearance'
import { formatMoney } from '../../../lib/money'

export function BudgetAllocationRing({
  total,
  rows,
  allocated,
}: {
  total: number
  rows: BudgetCategoryRow[]
  allocated: number
}) {
  let offset = 0
  const segments = rows
    .filter((r) => r.limitCents !== null && r.limitCents > 0)
    .map((row) => {
      const percent = total > 0 ? (row.limitCents! / total) * 100 : 0
      const segment = {
        id: row.categoryId,
        percent,
        offset,
        color: categoryAppearance(row.name).color,
      }
      offset += percent
      return segment
    })
  return (
    <div
      role="img"
      aria-label={`Category allocation: ${formatMoney(allocated)} assigned of ${formatMoney(total)}; ${formatMoney(total - allocated)} unallocated`}
      className="relative h-28 w-28 shrink-0"
    >
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-white/10"
        />
        {segments.map((s) => (
          <circle
            key={s.id}
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke={s.color}
            strokeWidth="10"
            pathLength="100"
            strokeDasharray={`${s.percent} ${100 - s.percent}`}
            strokeDashoffset={-s.offset}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <strong className="text-lg tabular-nums">
          {total > 0 ? Math.round((allocated / total) * 100) : 0}%
        </strong>
        <span className="text-[10px] text-slate-400">assigned</span>
      </div>
    </div>
  )
}
