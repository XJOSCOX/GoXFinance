import { sumCents, type billPlanningTotals } from '@goxfinance/shared'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { formatMoney } from '../../../lib/money'

export function BillsSummary({
  totals,
  month,
  overdueCount,
  unknownRecurringCount,
}: {
  totals: ReturnType<typeof billPlanningTotals> | null
  month: string
  overdueCount: number
  unknownRecurringCount: number
}) {
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryStat
        compact
        label="Monthly bills"
        tone="info"
        amount={formatMoney(totals?.monthlyBillsCents ?? null)}
        detail={
          totals
            ? `With confirmed debt plans: ${formatMoney(totals.billsAndConfirmedPlansCents)}`
            : 'Loading monthly obligations'
        }
      />
      <SummaryStat
        compact
        label="Remaining this month"
        tone="warning"
        amount={formatMoney(
          totals
            ? sumCents([totals.confirmedRemainingCents, totals.estimatedRemainingCents])
            : null,
        )}
        detail={
          totals
            ? `${month} · ${formatMoney(totals.confirmedRemainingCents)} confirmed + ${formatMoney(totals.estimatedRemainingCents)} estimated${totals.unknownCount ? ` · ${totals.unknownCount} unknown` : ''}`
            : 'Loading unpaid bills'
        }
      />
      <SummaryStat
        compact
        label="Upcoming month bills"
        tone="info"
        amount={formatMoney(totals?.nextMonthBillsCents ?? null)}
        detail={
          totals
            ? `${totals.nextMonth} · includes estimates; excludes carry-forward${totals.nextMonthUnknownCount ? ` · ${totals.nextMonthUnknownCount} unknown` : ''}`
            : 'Loading upcoming bills'
        }
      />
      <SummaryStat
        compact
        label="Overdue periods"
        tone={overdueCount ? 'negative' : 'neutral'}
        amount={String(overdueCount)}
        detail={
          unknownRecurringCount
            ? `${unknownRecurringCount} recurring amounts unknown`
            : 'Unpaid periods past their due date'
        }
      />
    </div>
  )
}
