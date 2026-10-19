import type { HouseholdOverview } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { toneStyles } from '../../../components/ui/semantic-tones'
import { formatMoney } from '../../../lib/money'

export function OverviewDebtProgress({ data }: { data: HouseholdOverview }) {
  const progress = data.debtProgress
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Debt payoff progress</h2>
        <span className="text-xs text-slate-400">{progress.trackedCount} tracked</span>
      </div>
      {progress.trackedCount > 0 ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400">Net balance reduction</p>
              <p className={`mt-1 font-semibold tabular-nums ${toneStyles.info.text}`}>
                {formatMoney(progress.reductionCents)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Tracked remaining</p>
              <p className={`mt-1 font-semibold tabular-nums ${toneStyles.info.text}`}>
                {formatMoney(progress.remainingCents)}
              </p>
            </div>
          </div>
          <div
            role="progressbar"
            aria-label="Recorded debt balance reduction"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent ?? undefined}
            aria-valuetext={
              progress.percent === null
                ? 'No positive starting balance'
                : `${progress.percent}% net balance reduction`
            }
            className="mt-3 h-2 overflow-hidden rounded-full bg-white/[.07]"
          >
            <div
              className={`h-full rounded-full ${toneStyles.positive.bar}`}
              style={{ width: `${progress.percent ?? 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {progress.percent === null
              ? 'No positive starting balance.'
              : `${progress.percent}% below starting recorded balances of ${formatMoney(progress.baselineCents)}.`}
            {progress.increaseCents > 0
              ? ` Net balances increased ${formatMoney(progress.increaseCents)}.`
              : ''}
          </p>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-[#b1beb0]">Balance comparisons</summary>
            <div className="mt-2 max-h-44 divide-y divide-white/[.07] overflow-y-auto">
              {progress.accounts.map((account) => (
                <div key={account.debtId} className="py-2">
                  <p className="font-medium">{account.name}</p>
                  <p className="mt-1 text-slate-400">
                    {account.baselineDate}: {formatMoney(account.baselineCents)} →{' '}
                    {account.latestDate}: {formatMoney(account.remainingCents)}
                  </p>
                  {account.unverified && (
                    <p className="mt-1 text-amber-200/70">
                      Includes unverified or manually recorded balances
                    </p>
                  )}
                </div>
              ))}
            </div>
          </details>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-400">
          More balance history needed. Add a later statement balance in Debt details to see
          progress.
        </p>
      )}
      {progress.missingHistoryCount > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {progress.missingHistoryCount} obligations lack two dated balance snapshots and are
          excluded.
        </p>
      )}
      {progress.unverifiedCount > 0 && (
        <p className="mt-2 text-xs text-amber-200/70">
          {progress.unverifiedCount} comparisons include unverified or manually recorded balances.
        </p>
      )}
      <p className="mt-2 text-xs leading-5 text-slate-500">
        All-time recorded balance changes, not total payments or proven principal paid. Interest,
        fees, borrowing, and corrections can affect balances. Shared debts and verified collection
        links count once.
      </p>
    </Card>
  )
}
