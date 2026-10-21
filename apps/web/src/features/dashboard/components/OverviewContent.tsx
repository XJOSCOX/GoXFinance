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
      </div>
      {cashFlowSummary}
      <OverviewAttention data={data} home={home} />
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <OverviewBills data={data} home={home} />
        {budgetSummary}
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <OverviewDetails label="Bill progress & payment activity">
          <div className="space-y-3">
            <OverviewProgress data={data} />
            <OverviewPayments payments={data.payments} home={home} refunds={data.refunds} />
          </div>
        </OverviewDetails>
        <OverviewDetails label="Debts & payoff progress">
          <div className="space-y-3">
            <OverviewDebtSnapshot data={data} home={home} />
            <OverviewDebtProgress data={data} />
          </div>
        </OverviewDetails>
        {goalSummary && <OverviewDetails label="Goal progress">{goalSummary}</OverviewDetails>}
        {tradingSummary && (
          <OverviewDetails label="Trading performance">{tradingSummary}</OverviewDetails>
        )}
      </div>
      <p className="border-t border-white/[.07] pt-4 text-xs leading-5 text-slate-500">
        Recorded cash flow is not your bank balance or available cash. Estimates and pending
        payments stay separate from confirmed activity.
      </p>
    </div>
  )
}
