import { sumCents, type BudgetReport } from '@goxfinance/shared'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { formatMoney } from '../../../lib/money'
export function BudgetTotals({ data }: { data: BudgetReport }) {
  const planned = data.budget?.status === 'active' ? data.budget.totalCents : null
  const allocated =
    planned === null ? null : sumCents(data.budget!.limits.map((l) => l.amountCents))
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat
          compact
          label="Planned budget"
          amount={planned === null ? 'Not set' : formatMoney(planned)}
          detail="Selected scope only; not spent"
        />
        <SummaryStat
          compact
          label="Actual purchase spending"
          amount={formatMoney(data.actualCents)}
          detail="Recorded purchases + paid standalone bills"
          tone="warning"
        />
        <SummaryStat
          compact
          label="Budget remaining"
          amount={data.remainingCents === null ? '—' : formatMoney(data.remainingCents)}
          detail={
            data.overCents
              ? `${formatMoney(data.overCents)} over total budget`
              : 'Not a bank or available-cash balance'
          }
          tone={data.overCents ? 'negative' : 'positive'}
        />
        <SummaryStat
          compact
          label="Previous month spent"
          amount={formatMoney(data.previous.actualCents)}
          detail={`${data.previous.month} · ${formatMoney(data.actualCents - data.previous.actualCents)} change`}
        />
      </div>
      {planned !== null && allocated !== null && (
        <p className="mt-3 text-sm text-slate-300">
          Monthly allocation {formatMoney(planned)} · Assigned to categories{' '}
          {formatMoney(allocated)} · Unallocated {formatMoney(planned - allocated)}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Previous planned budget:{' '}
        {data.previous.plannedCents === null ? 'Not set' : formatMoney(data.previous.plannedCents)}.
        Household and member limits overlap; they are never added together. Member-linked shared
        bill amounts are associations, not additional household spending.
      </p>
    </>
  )
}
