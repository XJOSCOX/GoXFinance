import { sumCents, type BudgetReport } from '@goxfinance/shared'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { formatMoney } from '../../../lib/money'
import { InfoHint } from '../../../components/ui/InfoHint'
export function BudgetTotals({ data }: { data: BudgetReport }) {
  const planned = data.budget?.status === 'active' ? data.budget.totalCents : null
  const allocated =
    planned === null ? null : sumCents(data.budget!.limits.map((l) => l.amountCents))
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat
          compact
          label="Monthly allocation"
          amount={planned === null ? 'Not set' : formatMoney(planned)}
          detail="Selected scope only; not spent"
        />
        <SummaryStat
          compact
          label="Actual spending"
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
          label="Unallocated"
          amount={
            planned === null || allocated === null ? 'Not set' : formatMoney(planned - allocated)
          }
          detail={
            allocated === null
              ? 'Set a monthly allocation first'
              : `${formatMoney(allocated)} assigned to categories`
          }
          tone={planned !== null && allocated !== null && allocated > planned ? 'negative' : 'info'}
        />
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
        Selected scope only
        <InfoHint
          label="Budget totals explained"
          text={`Purchase spending includes recorded purchases and paid standalone bills. Estimates are not spending. Debt-linked bill repayments remain transfers. Budget remaining is not available bank cash. Household and member limits overlap and are never added together. Previous month (${data.previous.month}): ${formatMoney(data.previous.actualCents)} spent, ${data.previous.plannedCents === null ? 'no planned budget' : formatMoney(data.previous.plannedCents) + ' planned'}; spending change ${formatMoney(data.actualCents - data.previous.actualCents)}.`}
        />
      </div>
    </>
  )
}
