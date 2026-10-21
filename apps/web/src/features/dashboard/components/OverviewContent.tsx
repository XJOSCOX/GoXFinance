import type { HouseholdOverview } from '@goxfinance/shared'
import type { ReactNode } from 'react'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { formatMoney } from '../../../lib/money'
import { OverviewPayments } from './OverviewPayments'
import { OverviewDebtSnapshot } from './OverviewDebtSnapshot'
import { OverviewBills } from './OverviewBills'
import { OverviewAttention } from './OverviewAttention'
import { OverviewProgress } from './OverviewProgress'
import { OverviewDebtProgress } from './OverviewDebtProgress'
import { OverviewDetails } from './OverviewDetails'
export function OverviewContent({
  data,
  home,
  goalSummary,
  budgetSummary,
  tradingSummary,
  cashFlowSummary,
}: {
  data: HouseholdOverview
  home: string
  budgetSummary?: ReactNode
  goalSummary?: ReactNode
  tradingSummary?: ReactNode
  cashFlowSummary?: ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <section aria-label="Monthly cash flow" className="contents">
          <div className="contents">
            <SummaryStat
              compact
              label="Income received"
              tone="positive"
              amount={formatMoney(data.income.confirmedCents)}
              detail="Confirmed net deposits"
            />
            <SummaryStat
              compact
              label="Cash paid"
              tone="warning"
              amount={formatMoney(data.actual.cashOutflowCents)}
              detail={
                data.refunds?.length
                  ? 'Completed outflows, net of refunds'
                  : 'Completed cash outflows only'
              }
            />
            <SummaryStat
              compact
              label="Net recorded cash flow"
              tone={
                data.income.netRecordedCashFlowCents < 0
                  ? 'negative'
                  : data.income.netRecordedCashFlowCents > 0
                    ? 'positive'
                    : 'default'
              }
              amount={formatMoney(data.income.netRecordedCashFlowCents)}
              detail="Income received minus cash paid"
            />
          </div>
        </section>
        <section
          aria-label="Monthly spending and obligations"
          className="col-span-full rounded-xl border border-white/[.07] px-4 py-3"
        >
          <dl className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <dt className="text-slate-400">Bills remaining</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {formatMoney(
                  data.payments.billAmounts.confirmedCount === 0 &&
                    data.payments.billAmounts.unconfirmedCount > 0
                    ? null
                    : data.payments.billAmounts.remainingCents,
                )}
              </dd>
              {data.payments.billAmounts.unconfirmedCount > 0 && (
                <p className="mt-1 text-[10px] text-amber-200">
                  {data.payments.billAmounts.unconfirmedCount} amounts unconfirmed
                </p>
              )}
            </div>
            <div>
              <dt className="text-slate-400">Monthly payment plan</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {formatMoney(data.bills.householdMonthlyObligationsCents)}
              </dd>
              <p className="mt-1 text-[10px] text-slate-500">Includes estimates</p>
            </div>
            <div>
              <dt className="text-slate-400">Purchase spending</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {formatMoney(data.actual.spendingCents)}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      {cashFlowSummary}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <OverviewBills data={data} home={home} />
          <OverviewDetails label="Bill progress & payment activity">
            <div className="space-y-3">
              <OverviewProgress data={data} />
              <OverviewPayments payments={data.payments} home={home} refunds={data.refunds} />
            </div>
          </OverviewDetails>
        </div>
        <div className="space-y-3">
          <OverviewAttention data={data} home={home} />
          {budgetSummary}
        </div>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-3">
        {tradingSummary}
        {goalSummary}
        <div className="space-y-3">
          <OverviewDebtSnapshot data={data} home={home} />
          <OverviewDetails label="Debt payoff history">
            <OverviewDebtProgress data={data} />
          </OverviewDetails>
        </div>
      </div>
      <p className="border-t border-white/[.07] pt-4 text-xs leading-5 text-slate-500">
        Recorded cash flow is not your bank balance or available cash. Credit-card repayments count
        as cash paid, not a second purchase. Debt-linked bill payments count once. Pending and
        scheduled payments are excluded from cash paid.
      </p>
    </div>
  )
}
