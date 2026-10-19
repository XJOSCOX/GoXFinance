import type { HouseholdOverview } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { OverviewBillAmounts } from './OverviewBillAmounts'
import { formatMoney } from '../../../lib/money'

export function OverviewProgress({ data }: { data: HouseholdOverview }) {
  const progress = data.payments.billProgress
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Monthly bill progress</h2>
        <span className="text-xs text-slate-400">
          {progress.settledCount} of {progress.totalCount} bill periods settled
        </span>
      </div>
      <OverviewBillAmounts amounts={data.payments.billAmounts} />
      <div className="mt-3 flex items-baseline justify-between gap-3">
        {progress.percent === null ? (
          <p className="text-sm text-slate-400">Confirm bill amounts to track progress.</p>
        ) : (
          <p className="text-sm">
            <strong className="tabular-nums">{formatMoney(progress.paidCents)}</strong>
            <span className="text-xs text-slate-400">
              {' '}
              paid toward {formatMoney(progress.billedCents)} billed
            </span>
          </p>
        )}
        <span className="text-sm font-semibold tabular-nums">
          {progress.percent === null ? '—' : `${progress.percent}%`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Actual bills covered"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent ?? undefined}
        aria-valuetext={
          progress.percent === null
            ? 'No confirmed bill amounts'
            : `${progress.percent}% covered by payments and credits`
        }
        className="mt-2 h-2 overflow-hidden rounded-full bg-white/[.07]"
      >
        <div
          className="h-full rounded-full bg-[#a9b8a9] transition-[width]"
          style={{ width: `${progress.percent ?? 0}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {progress.totalCount === 0
          ? 'No bills due in the selected month.'
          : progress.billedCents === 0
            ? 'No positive confirmed bill amounts yet.'
            : `${formatMoney(progress.remainingCents)} remaining on known bills.`}
        {progress.creditCents > 0
          ? ` ${formatMoney(progress.creditCents)} covered by credits.`
          : ''}
        {progress.unknownCount > 0
          ? ` ${progress.unknownCount} amounts unconfirmed; progress is incomplete.`
          : ''}{' '}
        Estimates and pending payments are excluded.
      </p>
    </Card>
  )
}
