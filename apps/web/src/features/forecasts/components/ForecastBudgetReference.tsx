import { budgetSpending, budgetUsage, sumCents, type ForecastSources } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'
export function ForecastBudgetReference({
  sources,
  month,
}: {
  sources: ForecastSources
  month: string
}) {
  const budget = sources.budgets?.find(
    (b) => b.month === month && b.responsibleMemberId === null && b.status === 'active',
  )
  if (!budget)
    return (
      <p className="text-xs text-slate-500">
        No active household budget for {month}. Additional variable spending is an explicit scenario
        assumption.
      </p>
    )
  const spent = sumCents(
      budgetSpending(sources.expenses, sources.bills, month, null).map((r) => r.actualCents),
    ),
    usage = budgetUsage(budget.totalCents, spent)
  return (
    <p className="text-xs text-slate-400">
      Budget reference ({month}): {formatMoney(budget.totalCents)} allocated · {formatMoney(spent)}{' '}
      purchase spending · {formatMoney(usage.remainingCents)} remaining. This ceiling is not
      automatically added to forecast outflows because it may already include bills. Enter any
      additional spending allowance explicitly.
    </p>
  )
}
