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
export function OverviewContent({
  data,
  home,
  goalSummary,
  tradingSummary,
}: {
  data: HouseholdOverview
  home: string
  goalSummary?: ReactNode
  tradingSummary?: ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
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
              detail="Completed cash outflows only"
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
        <section aria-label="Monthly spending and obligations" className="contents">
          <SummaryStat
            compact
            label="Bills remaining"
            tone="warning"
            amount={formatMoney(
              data.payments.billAmounts.confirmedCount === 0 &&
                data.payments.billAmounts.unconfirmedCount > 0
                ? null
                : data.payments.billAmounts.remainingCents,
            )}
            detail={
              data.payments.billAmounts.unconfirmedCount
                ? `${data.payments.billAmounts.unconfirmedCount} unknown amounts excluded`
                : 'Known bills due this month'
            }
          />
          <SummaryStat
            compact
            label="Monthly payment plan"
            tone="info"
            amount={formatMoney(data.bills.householdMonthlyObligationsCents)}
            detail="Known bills + debt minimums; includes estimates"
          />
          <SummaryStat
            compact
            label="Purchase spending"
            tone="warning"
            amount={formatMoney(data.actual.spendingCents)}
            detail="Expenses + standalone bill payments"
          />
        </section>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-[1.2fr_1fr] xl:grid-cols-3">
        <div className="order-2 space-y-3 lg:order-1 xl:col-span-2">
          <OverviewProgress data={data} />
          <OverviewBills data={data} home={home} />
          <OverviewPayments payments={data.payments} home={home} />
        </div>
        <div className="contents lg:order-2 lg:block lg:space-y-3">
          <div className="order-1">
            <OverviewAttention data={data} home={home} />
          </div>
          <div className="order-3 space-y-3">
            {tradingSummary}
            {goalSummary}
          </div>
          <div className="order-4">
            <OverviewDebtProgress data={data} />
          </div>
          <div className="order-5">
            <OverviewDebtSnapshot data={data} home={home} />
          </div>
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
