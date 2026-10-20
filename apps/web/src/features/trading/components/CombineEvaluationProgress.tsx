import { tradingPayoutProgress, type TradingAccount, type TradingResult } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'
import { amountTone, toneStyles } from '../../../components/ui/semantic-tones'
import { CombineJournal } from './CombineJournal'
export function CombineEvaluationProgress({
  account,
  results,
  perAccount = false,
}: {
  account: TradingAccount
  results: TradingResult[]
  perAccount?: boolean
}) {
  const progress = tradingPayoutProgress(account, results, [], new Date().toISOString())
  const rule = progress.rule
  return (
    <section
      aria-label="Combine evaluation"
      className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/10 p-4"
    >
      <h3 className="text-sm font-medium">
        Combine evaluation{perAccount ? ' · each account' : ''}
      </h3>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Base profit target</dt>
          <dd className={toneStyles.info.text}>{formatMoney(rule?.profitTargetCents ?? null)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Recorded net P&amp;L</dt>
          <dd className={toneStyles[amountTone(progress.netCents)].text}>
            {progress.sessionCount ? formatMoney(progress.netCents) : 'No results entered'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Consistency target</dt>
          <dd>
            {rule?.combineConsistencyBps == null
              ? 'Unknown'
              : `${rule.combineConsistencyBps / 100}%`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Position limit</dt>
          <dd>
            {rule?.maximumMiniContracts ?? 'Unknown'} mini /{' '}
            {rule?.maximumMicroContracts ?? 'Unknown'} micro
          </dd>
        </div>
      </dl>
      <p className="text-xs text-slate-500">
        {progress.sessionCount} recorded sessions since {progress.start ?? 'an unknown start date'}.
        Simulated evaluation results are not payout income. Topstep confirms passing; consistency
        can increase the required target. These saved settings do not enforce provider limits.
      </p>
      <CombineJournal account={account} results={results} />
    </section>
  )
}
