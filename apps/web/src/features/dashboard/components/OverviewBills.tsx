import { billPeriodEstimate } from '@goxfinance/shared'
import { Link } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import type { HouseholdOverview } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function OverviewBills({ data, home }: { data: HouseholdOverview; home: string }) {
  return (
    <Card className="min-w-0 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Bills to take care of</h2>
        <Link to={`/households/${home}/bills`} className="text-xs text-[#b1beb0] hover:underline">
          View bills
        </Link>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Next outstanding bills, including overdue periods. Across all months.
      </p>
      {data.upcoming.length ? (
        <div className="mt-3 max-h-56 divide-y divide-white/[.07] overflow-y-auto">
          {data.upcoming.map((period) => (
            <div
              key={period.id}
              className="flex flex-col justify-between gap-3 py-3 text-sm sm:flex-row sm:items-start"
            >
              <div className="min-w-0">
                <Link
                  to={`/households/${home}/bills`}
                  className="break-words font-medium hover:underline"
                >
                  {period.billName}
                </Link>
                <p
                  className={`mt-1 text-xs ${period.overdue ? 'text-amber-200/80' : 'text-slate-500'}`}
                >
                  {period.dueDate}
                  {period.overdue ? ' · Overdue' : ''}
                </p>
              </div>
              <div className="min-w-0 text-right">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                  {(
                    [
                      ['Budget estimate', billPeriodEstimate(period)],
                      ['Confirmed bill', period.amountCents],
                      ['Actually paid', period.paidCents],
                      ['Still owed', period.amountCents === null ? null : period.remainingCents],
                    ] as const
                  ).map(([label, amount]) => (
                    <div key={label}>
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="mt-1 font-medium tabular-nums">{formatMoney(amount)}</dd>
                    </div>
                  ))}
                </dl>
                {period.creditCents > 0 && (
                  <p className="mt-2 text-xs text-slate-400">
                    {formatMoney(period.creditCents)} credit
                  </p>
                )}
                {period.amountCents === null && (
                  <p className="mt-2 text-xs text-amber-200/70">Actual bill not confirmed</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-2.5 text-center">
          <CalendarDays size={24} className="text-[#a9b8a9]" />
          <p className="mt-3 text-sm font-medium">No outstanding bills</p>
          <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
            Manage your bills to add upcoming obligations and track amounts owed.
          </p>
        </div>
      )}
    </Card>
  )
}
