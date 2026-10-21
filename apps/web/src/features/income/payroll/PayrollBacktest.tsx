import { payrollBacktest, type PayrollProfile, type PayrollWeek } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'
export function PayrollBacktest({
  weeks,
  profile,
}: {
  weeks: PayrollWeek[]
  profile: PayrollProfile
}) {
  const report = payrollBacktest(weeks, profile)
  return (
    <details className="rounded-xl border border-white/10 p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Historical forecast backtest
      </summary>
      <p className="mt-3 text-xs text-slate-400">{report.label}</p>
      <p className="mt-3 text-sm">
        Evaluated {report.summary.evaluated} - Net MAE {formatMoney(report.summary.maeCents)} -
        Median absolute error {formatMoney(report.summary.medianAbsoluteErrorCents)}
      </p>
      <p className="mt-2 text-xs text-slate-400">
        Ordinary MAE {formatMoney(report.ordinary.maeCents)} - Bonus MAE{' '}
        {formatMoney(report.bonus.maeCents)}
      </p>
      {report.bySampleCount.map((g) => (
        <p key={g.sampleCount} className="mt-1 text-xs">
          {g.sampleCount} prior samples - {g.evaluated} evaluated - MAE {formatMoney(g.maeCents)}
        </p>
      ))}
      <div className="mt-3 space-y-2">
        {report.results.map((r) => (
          <details key={r.weekId}>
            <summary className="cursor-pointer text-xs">
              {r.payDate} - {r.bonus ? 'Bonus' : 'Ordinary'} - {r.sampleCount} prior samples
            </summary>
            {r.skipped ? (
              <p className="text-xs">{r.skipped}</p>
            ) : (
              r.errors.map((e) => (
                <p key={e.name} className="mt-1 text-xs text-slate-400">
                  {e.name}: predicted {formatMoney(e.predictedCents)}, actual{' '}
                  {formatMoney(e.actualCents)}, absolute error {formatMoney(e.absoluteErrorCents)}
                  {e.percentageError !== null ? ` (${e.percentageError.toFixed(2)}%)` : ''}
                </p>
              ))
            )}
          </details>
        ))}
      </div>
    </details>
  )
}
