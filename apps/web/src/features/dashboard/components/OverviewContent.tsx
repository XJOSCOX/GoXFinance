import { Link } from 'react-router-dom'
import type { HouseholdOverview } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { formatMoney } from '../../../lib/money'

export function OverviewContent({ data, home }: { data: HouseholdOverview; home: string }) {
  const summary = data.debts.summary,
    debtTotal =
      summary.confirmedBalanceCents + summary.estimatedBalanceCents + summary.unverifiedBalanceCents
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat
          label="Household debt"
          amount={formatMoney(debtTotal)}
          detail={`${summary.countedObligationCount} obligations · known balances only`}
        />
        <SummaryStat
          label="Monthly obligations"
          amount={formatMoney(data.bills.householdMonthlyObligationsCents)}
          detail="Bills and debt minimums; includes estimates"
        />
        <SummaryStat
          label="Purchases this month"
          amount={formatMoney(data.actual.spendingCents)}
          detail="Everyday expenses + standalone bill payments"
        />
        <SummaryStat
          label="Cash paid this month"
          amount={formatMoney(data.actual.cashOutflowCents)}
          detail="Confirmed payments; excludes credit purchases"
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Upcoming & overdue bills</h2>
            <Link
              className="text-xs text-[#b1beb0] hover:underline"
              to={`/households/${home}/bills`}
            >
              View bills
            </Link>
          </div>
          <div className="mt-4 divide-y divide-white/10">
            {data.upcoming.length ? (
              data.upcoming.map((period) => (
                <div
                  key={period.id}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <div>
                    <p>{period.billName}</p>
                    <p
                      className={`mt-1 text-xs ${period.overdue ? 'text-amber-200' : 'text-slate-400'}`}
                    >
                      {period.dueDate}
                      {period.overdue ? ' · Overdue' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums">{formatMoney(period.remainingCents)}</p>
                    {period.amountCents === null && (
                      <p className="mt-1 text-xs text-slate-400">
                        Estimate {formatMoney(period.estimatedAmountCents)}
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-8 text-sm text-slate-400">
                No outstanding bill periods. Add bills to see upcoming obligations.
              </p>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Needs attention</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-400">
            {summary.unknownBalanceCount > 0 && (
              <p>{summary.unknownBalanceCount} debt balances are unknown.</p>
            )}
            {summary.unverifiedBalanceCents > 0 && (
              <p>
                {formatMoney(summary.unverifiedBalanceCents)} in debt balances remains unverified.
              </p>
            )}
            {data.bills.overdueCount > 0 && (
              <p>{data.bills.overdueCount} bill periods are overdue.</p>
            )}
            {data.bills.unknownRecurringCount > 0 && (
              <p>{data.bills.unknownRecurringCount} recurring bills need an amount or estimate.</p>
            )}
            <p>{data.bills.estimatedRecurringCount} variable bills use budget estimates.</p>
            <p>
              Available cash is not calculated: income and bank account tracking are not set up.
            </p>
          </div>
        </Card>
      </div>
      <Card className="p-5">
        <h2 className="font-semibold">This month at a glance</h2>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <p>
            <span className="block text-slate-400">Everyday expenses</span>
            <strong className="mt-1 block">{data.expenses.length} purchases</strong>
          </p>
          <p>
            <span className="block text-slate-400">Actual bill amounts remaining</span>
            <strong className="mt-1 block">{formatMoney(data.bills.outstandingCents)}</strong>
          </p>
          <p>
            <span className="block text-slate-400">Confirmed outflows</span>
            <strong className="mt-1 block">{data.actual.transactionCount} transactions</strong>
          </p>
        </div>
        <p className="mt-5 border-t border-white/10 pt-4 text-xs text-slate-500">
          Credit-card purchases count as spending when purchased. Repayments count as cash paid, not
          a second purchase. Debt-linked bill payments are counted once. Unknown amounts remain
          unknown.
        </p>
      </Card>
    </div>
  )
}
