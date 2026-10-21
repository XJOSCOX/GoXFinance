import { billPeriodEstimate } from '@goxfinance/shared'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronDown } from 'lucide-react'
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
      <p className="mt-1 text-xs text-slate-500">
        Next outstanding bills, including overdue periods.
      </p>
      {data.upcoming.length ? (
        <div className="mt-2 divide-y divide-white/[.07]">
          {data.upcoming.slice(0, 5).map((period) => (
            <details key={period.id} className="group/bill py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md focus-visible:outline focus-visible:outline-[#a9b8a9] [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block break-words text-sm font-medium">{period.billName}</span>
                  <span
                    className={`mt-0.5 block text-[11px] ${period.overdue ? 'text-rose-300' : 'text-slate-500'}`}
                  >
                    {period.dueDate}
                    {period.overdue ? ' · Overdue' : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-right">
                  <span>
                    <span
                      className={`block text-sm font-semibold tabular-nums ${period.overdue ? 'text-rose-200' : 'text-slate-200'}`}
                    >
                      {period.amountCents === null
                        ? billPeriodEstimate(period) === null
                          ? 'Unknown'
                          : '≈ ' +
                            formatMoney(
                              Math.max(
                                0,
                                billPeriodEstimate(period)! - period.paidCents - period.creditCents,
                              ),
                            )
                        : formatMoney(period.remainingCents)}
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      {period.amountCents === null ? 'Estimated remaining' : 'Still owed'}
                    </span>
                  </span>
                  <ChevronDown
                    size={13}
                    aria-hidden="true"
                    className="text-slate-500 transition-transform group-open/bill:rotate-180"
                  />
                </span>
              </summary>
              <div className="mt-3 rounded-lg bg-white/[.025] p-3">
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
            </details>
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
