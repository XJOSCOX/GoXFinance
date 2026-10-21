import { Link } from 'react-router-dom'
import { CircleAlert } from 'lucide-react'
import type { HouseholdOverview } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'

export function OverviewAttention({ data, home }: { data: HouseholdOverview; home: string }) {
  const summary = data.debts.summary
  const alerts = [
    ...(data.bills.overdueCount
      ? [{ text: `${data.bills.overdueCount} overdue bill periods`, path: 'bills' }]
      : []),
    ...(summary.unknownBalanceCount
      ? [{ text: `${summary.unknownBalanceCount} debt balances need an amount`, path: 'debts' }]
      : []),
    ...(summary.unverifiedBalanceCents > 0
      ? [
          {
            text: `${formatMoney(summary.unverifiedBalanceCents)} in debt balances is unverified`,
            path: 'debts',
          },
        ]
      : []),
    ...(data.bills.unknownRecurringCount
      ? [
          {
            text: `${data.bills.unknownRecurringCount} recurring bills need an amount or estimate`,
            path: 'bills',
          },
        ]
      : []),
    ...(data.payments.futureCompletedCount
      ? [
          {
            text: `${data.payments.futureCompletedCount} completed payments have future dates and are excluded from actual totals`,
            path: 'bills',
          },
        ]
      : []),
  ]
  if (!alerts.length) return null
  return (
    <Card className="border-amber-300/20 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-amber-200">
          <CircleAlert size={14} />
          Needs attention <span className="text-slate-500">{alerts.length}</span>
        </h2>
        {alerts.map((alert) => (
          <Link
            key={alert.text}
            to={`/households/${home}/${alert.path}`}
            className="text-xs text-slate-300 hover:text-white hover:underline"
          >
            {alert.text}
          </Link>
        ))}
      </div>
    </Card>
  )
}
