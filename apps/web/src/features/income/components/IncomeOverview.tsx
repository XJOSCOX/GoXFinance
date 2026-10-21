import {
  incomeSummary,
  type IncomeData,
  type HouseholdMember,
  type PayrollWeek,
  type IncomeTransaction,
} from '@goxfinance/shared'
import { IncomePaycheckStats } from './IncomePaycheckStats'
import { LatestPaycheck } from './LatestPaycheck'
import { IncomeYtd } from './IncomeYtd'
import { paycheckOverview } from './paycheck-overview'
import { IncomeMonthSummary } from './IncomeMonthSummary'
import { RecentPaychecks } from './RecentPaychecks'
import { Button } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function IncomeOverview({
  data,
  members,
  month,
  today,
  changeMonth,
  weeks = [],
  payrollLoading = false,
  payrollError = '',
  viewPaycheck,
}: {
  data: IncomeData
  members: HouseholdMember[]
  month: string
  today: string
  changeMonth: (month: string) => void
  weeks?: PayrollWeek[]
  payrollLoading?: boolean
  payrollError?: string
  viewPaycheck?: (t: IncomeTransaction) => void
}) {
  const summary = incomeSummary(data.transactions, month, today),
    pay = paycheckOverview(data.transactions, month, today),
    sourceIds = new Set(data.transactions.map((t) => t.sourceId)),
    visibleWeeks = weeks.filter((w) => sourceIds.has(w.sourceId)),
    latestWeek = visibleWeeks.find((w) => w.incomeTransactionId === pay.latest?.id),
    latestMonth = summary.monthly[0]?.period,
    monthLabel = new Date(month + '-01T12:00:00Z').toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  return (
    <div className="space-y-4">
      {summary.confirmedCents === 0 &&
        !summary.bySource.length &&
        latestMonth &&
        latestMonth !== month && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
            <p>
              No received paychecks in {monthLabel}. Latest pay month: {latestMonth}.
            </p>
            <Button size="small" variant="ghost" onClick={() => changeMonth(latestMonth)}>
              View latest pay month
            </Button>
          </div>
        )}
      <IncomeMonthSummary
        net={summary.confirmedCents}
        gross={pay.gross.cents}
        deductions={pay.deductions.cents}
        received={pay.receivedCount}
        pending={data.transactions.filter((t) => t.status === 'pending').length}
        month={monthLabel}
        missing={
          data.transactions.filter(
            (t) =>
              t.status === 'confirmed' &&
              t.depositDate?.startsWith(month) &&
              t.depositDate <= today &&
              (t.actualGrossCents === null || t.deductionsCents === null),
          ).length
        }
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-4">
          <LatestPaycheck
            transaction={pay.latest}
            source={data.sources.find((s) => s.id === pay.latest?.sourceId)}
            week={latestWeek}
            member={members.find((m) => m.id === pay.latest?.responsibleMemberId)?.fullName}
          />
          <RecentPaychecks
            transactions={data.transactions}
            sources={data.sources}
            view={viewPaycheck}
          />
        </div>
        <div className="min-w-0 space-y-4">
          <IncomeYtd
            weeks={visibleWeeks}
            sources={data.sources.filter((s) => sourceIds.has(s.id))}
            year={month.slice(0, 4)}
            loading={payrollLoading}
            error={payrollError}
          />
          <IncomePaycheckStats data={data} today={today} />
        </div>
      </div>
      <details className="rounded-xl border border-white/8 px-5 py-3 text-sm">
        <summary className="cursor-pointer text-slate-400">Expected income & data coverage</summary>
        <div className="mt-3 grid gap-3 text-xs text-slate-400 sm:grid-cols-2">
          <p>
            Recorded future estimates: {formatMoney(summary.expectedCents)}.{' '}
            {summary.expectedUnknownCount} amounts unknown.
          </p>
          <p>
            Gross, deductions and deposited totals use confirmed deposits in the selected month.
            Paycheck and YTD details retain their original statement dates.
          </p>
        </div>
      </details>
    </div>
  )
}
