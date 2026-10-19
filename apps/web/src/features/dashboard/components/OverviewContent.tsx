import type { HouseholdOverview } from '@goxfinance/shared'
import { Link } from 'react-router-dom'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { formatMoney } from '../../../lib/money'
import { OverviewPayments } from './OverviewPayments'
import { OverviewDebtSnapshot } from './OverviewDebtSnapshot'
import { OverviewBills } from './OverviewBills'
import { OverviewAttention } from './OverviewAttention'
export function OverviewContent({ data, home }: { data: HouseholdOverview; home: string }) {
  const base = `/households/${home}`
  return (
    <div className="space-y-6">
      <section aria-label="Monthly cash flow">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryStat
            label="Income received"
            amount={formatMoney(data.income.confirmedCents)}
            detail="Confirmed net deposits"
          />
          <SummaryStat
            label="Cash paid"
            amount={formatMoney(data.actual.cashOutflowCents)}
            detail="Completed cash outflows only"
          />
          <SummaryStat
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
        <p className="mt-3 text-xs text-slate-500">
          For the selected month. Recorded cash flow is not your bank balance or available cash;
          opening balances and unrecorded transactions are excluded.
        </p>
      </section>
      <nav aria-label="Manage household finances" className="flex flex-wrap gap-2">
        {[
          ['bills', 'Manage bills'],
          ['income', 'Record income'],
          ['expenses', 'Record an expense'],
          ['debts', 'Manage debts'],
        ].map(([path, label]) => (
          <Link
            key={path}
            to={`${base}/${path}`}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-white/[.05] focus-visible:outline focus-visible:outline-[#a9b8a9]"
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="grid items-start gap-5 xl:grid-cols-[1.35fr_1fr]">
        <OverviewBills data={data} home={home} />
        <OverviewDebtSnapshot data={data} home={home} />
      </div>
      <section aria-label="Monthly spending and obligations" className="grid gap-3 sm:grid-cols-3">
        <SummaryStat
          label="Bills remaining"
          amount={formatMoney(data.payments.remainingBills.amountCents)}
          detail={`Due in selected month · includes budget estimates${data.payments.remainingBills.unknownCount ? ` · ${data.payments.remainingBills.unknownCount} unknown amounts excluded` : ''}`}
        />
        <SummaryStat
          label="Monthly payment plan"
          amount={formatMoney(data.bills.householdMonthlyObligationsCents)}
          detail="Known current recurring bills and debt minimums, including estimates; linked obligations counted once"
        />
        <SummaryStat
          label="Purchase spending"
          amount={formatMoney(data.actual.spendingCents)}
          detail="Selected month · expenses and standalone bill payments, including credit-card purchases"
        />
      </section>
      <div className="grid items-start gap-5 xl:grid-cols-[1.35fr_1fr]">
        <OverviewPayments payments={data.payments} home={home} />
        <OverviewAttention data={data} home={home} />
      </div>
      <p className="border-t border-white/[.07] pt-4 text-xs leading-5 text-slate-500">
        Credit-card repayments count as cash paid, not a second purchase. Debt-linked bill payments
        count once. Pending and scheduled payments are excluded from cash paid.
      </p>
    </div>
  )
}
