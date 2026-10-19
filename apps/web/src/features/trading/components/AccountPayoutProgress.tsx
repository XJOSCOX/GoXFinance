import {
  tradingPayoutProgress,
  type TradingAccount,
  type TradingResult,
  type TradingPayout,
} from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'

export function AccountPayoutProgress({
  account,
  results,
  payouts,
  perAccount = false,
}: {
  account: TradingAccount
  results: TradingResult[]
  payouts: TradingPayout[]
  perAccount?: boolean
}) {
  const progress = tradingPayoutProgress(account, results, payouts, new Date().toISOString())
  return (
    <section className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/10 p-4">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <h3 className="font-medium">Winning-day progress{perAccount ? ' · each account' : ''}</h3>
        <span>
          {progress.qualifyingDays ?? 'Unknown'} / {progress.target ?? 'Unknown'} days
        </span>
      </div>
      {progress.target != null && progress.target > 0 && progress.qualifyingDays != null && (
        <progress
          className="h-2 w-full accent-[#b2bfaf]"
          aria-label={`${account.nickname} winning-day progress`}
          value={Math.min(progress.qualifyingDays, progress.target)}
          max={progress.target}
        />
      )}
      <p className="text-xs text-slate-400">
        Net session result at least {formatMoney(progress.threshold)} · Since{' '}
        {progress.start ?? 'Unknown'}. {progress.sessionCount} recorded sessions.
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Recorded net profit</dt>
          <dd>{formatMoney(progress.netCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Estimated payout after split</dt>
          <dd className="font-semibold">{formatMoney(progress.estimate?.traderCents ?? null)}</dd>
        </div>
      </dl>
      {progress.reservedCents > 0 && (
        <p className="text-xs text-slate-400">
          {formatMoney(progress.reservedCents)} in recorded payout requests / approvals / receipts
          excluded from the estimate.
        </p>
      )}
      <p className="text-xs text-slate-500">
        {progress.targetMet
          ? 'Recorded day target met. '
          : 'Day target not yet met or incomplete. '}
        Estimate only, not confirmed income or payout eligibility.
      </p>
      {progress.currentSessionIncluded && (
        <p className="text-xs text-slate-500">The current session is included and may change.</p>
      )}
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">Calculation &amp; cycle details</summary>
        <p className="mt-2">
          Uses net session results after fees, including losses; existing payout requests, approvals
          and receipts are reserved before applying the saved cap and split. Dates identify session
          starts. Cycles do not reset automatically: edit the progress start date after a confirmed
          cycle reset. Other provider restrictions may apply.
        </p>
      </details>
    </section>
  )
}
