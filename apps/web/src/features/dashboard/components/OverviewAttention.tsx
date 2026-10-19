import { Link } from 'react-router-dom'
import { CircleCheck, CircleAlert } from 'lucide-react'
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
  return (
    <Card className="min-w-0 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <CircleAlert size={16} className="text-slate-400" />
        Needs attention
        {alerts.length > 0 && (
          <span className="ml-auto text-xs font-normal text-slate-500">{alerts.length}</span>
        )}
      </h2>
      {alerts.length ? (
        <ul className="mt-3 divide-y divide-white/[.07]">
          {alerts.map((alert) => (
            <li key={alert.text}>
              <Link
                to={`/households/${home}/${alert.path}`}
                className="flex items-start justify-between gap-3 py-2 text-sm text-slate-300 hover:text-white"
              >
                <span>{alert.text}</span>
                <span className="shrink-0 text-xs text-[#b1beb0]">Review</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-400">
          <CircleCheck size={16} className="text-[#a9b8a9]" />
          No data warnings to review.
        </p>
      )}
      {data.bills.estimatedRecurringCount > 0 && (
        <p className="mt-3 border-t border-white/[.07] pt-4 text-xs leading-5 text-slate-500">
          {data.bills.estimatedRecurringCount} variable bills use budget estimates. Confirm each
          actual bill before recording a payment.
        </p>
      )}
    </Card>
  )
}
