import type { TradingStageReport } from '@goxfinance/shared'
import { amountTone, toneStyles } from '../ui/semantic-tones'
import { formatMoney } from '../../lib/money'

export function TradingProfitGroups({
  report,
  showBreakdown = false,
}: {
  report: TradingStageReport
  showBreakdown?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {[report.combine, report.funded].map((group) => (
          <section
            key={group.stage}
            aria-label={group.stage === 'combine' ? 'Combine P&L' : 'Funded account P&L'}
            className="min-w-0 rounded-xl border border-white/10 bg-white/[.015] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">
                  {group.stage === 'combine' ? 'Combine · simulated' : 'Funded accounts'}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {group.accounts.length} accounts ·{' '}
                  {group.stage === 'combine' ? 'Not cash or income' : 'P&L is not deposited cash'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-500">Total net P&amp;L</p>
                <p
                  className={`mt-1 text-xl font-semibold tabular-nums ${toneStyles[amountTone(group.netCents)].text}`}
                >
                  {formatMoney(group.netCents)}
                </p>
              </div>
            </div>
            {showBreakdown && (
              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[.07] pt-3 text-xs">
                {(
                  [
                    ['Profit', group.profitCents],
                    ['Loss', group.lossCents],
                    ['Additional fees', group.feesCents],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-slate-500">
                      {label}
                      {group.missingBreakdownCount && label !== 'Additional fees' ? ' (known)' : ''}
                    </dt>
                    <dd className="mt-1 tabular-nums">{formatMoney(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {group.accounts.length ? (
              <ul className="mt-3 divide-y divide-white/[.06] border-t border-white/[.07]">
                {group.accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <span className="min-w-0">
                      <span className="block break-words text-slate-300">{a.nickname}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {a.resultCount
                          ? `${a.resultCount} recorded entries`
                          : 'No results recorded'}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-medium tabular-nums ${toneStyles[amountTone(a.netCents)].text}`}
                    >
                      {formatMoney(a.netCents)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                No {group.stage === 'combine' ? 'Combine' : 'funded'} accounts.
              </p>
            )}
            {showBreakdown && group.missingBreakdownCount > 0 && (
              <p className="mt-2 text-[11px] text-amber-200">
                {group.missingBreakdownCount} results have no separate profit/loss breakdown. Net
                includes them; profit/loss show entered breakdowns only.
              </p>
            )}
          </section>
        ))}
      </div>
      {report.unclassifiedCount > 0 && (
        <p role="alert" className="text-xs text-amber-200">
          {report.unclassifiedCount} results could not be linked to an account stage and are
          excluded from these totals.
        </p>
      )}
    </div>
  )
}
