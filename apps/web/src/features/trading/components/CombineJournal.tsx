import { combineJournal, type TradingAccount, type TradingResult } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'
import { toneStyles } from '../../../components/ui/semantic-tones'

export function CombineJournal({
  account,
  results,
}: {
  account: TradingAccount
  results: TradingResult[]
}) {
  const journal = combineJournal(account, results, new Date().toISOString())
  return (
    <div className="space-y-3 border-t border-white/10 pt-3">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">Journal balance · estimated</dt>
          <dd>{formatMoney(journal.balanceCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">
            Trailing loss floor {journal.locked ? '· locked' : ''}
          </dt>
          <dd className={toneStyles.warning.text}>{formatMoney(journal.floorCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Buffer above floor</dt>
          <dd className={toneStyles[journal.recordedBreach ? 'negative' : 'positive'].text}>
            {formatMoney(journal.bufferCents)}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-slate-400">
        Started {journal.start ?? 'not entered'} · {journal.daysSinceStart ?? 'Unknown'} days ·
        30-day review {journal.reviewDate ?? 'not scheduled'}
        {journal.reviewDue ? ' · Review due' : ''}. Review is a reminder, not an automatic reset or
        failure.
      </p>
      {journal.recordedBreach && (
        <p role="alert" className={`text-xs ${toneStyles.negative.text}`}>
          A recorded balance touched or crossed the loss floor. Verify the provider status; the app
          has not changed it.
        </p>
      )}
      <p className="text-xs text-slate-500">
        Reconstructed from the Combine tier and recorded net results since the start date. The floor
        trails completed recorded sessions only, never falls, and locks at the starting tier.
        Current-session results are provisional. Missing sessions and intraday losses are not known;
        this is not a live risk monitor.
      </p>
      <details>
        <summary className="cursor-pointer text-xs text-slate-300">
          Daily journal ({journal.rows.length} sessions)
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2 pr-3">Session start</th>
                <th className="pr-3">Net</th>
                <th className="pr-3">Balance</th>
                <th className="pr-3">Loss floor</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {journal.rows.map((row) => (
                <tr key={row.date} className="border-t border-white/5">
                  <td className="py-2 pr-3">{row.date}</td>
                  <td className="pr-3">{formatMoney(row.netCents)}</td>
                  <td className="pr-3">{formatMoney(row.balanceCents)}</td>
                  <td className="pr-3">{formatMoney(row.floorCents)}</td>
                  <td>
                    {row.reachedFloor
                      ? 'Floor reached'
                      : row.completed
                        ? 'Recorded close'
                        : 'Provisional'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!journal.rows.length && (
            <p className="py-2 text-slate-500">No results recorded since the start date.</p>
          )}
        </div>
      </details>
    </div>
  )
}
