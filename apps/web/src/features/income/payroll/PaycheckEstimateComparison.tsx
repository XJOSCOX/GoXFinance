import { payrollComparison, type PayrollWeek } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'
export function PaycheckEstimateComparison({ week }: { week: PayrollWeek }) {
  const comparison = payrollComparison(week)
  if (!comparison || comparison.errorCents === null) return null
  const delta = comparison.errorCents
  return (
    <section
      aria-label="Paycheck versus saved estimate"
      className="border-t border-white/10 px-5 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-300">Paycheck vs saved estimate</h3>
        <p
          className={`text-sm font-semibold tabular-nums ${delta < 0 ? 'text-amber-200' : 'text-emerald-200'}`}
        >
          {delta === 0
            ? 'Matches estimate'
            : `${formatMoney(Math.abs(delta))} ${delta > 0 ? 'above' : 'below'} estimate`}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-slate-500">Saved take-home estimate</dt>
          <dd className="mt-1 font-medium tabular-nums">{formatMoney(comparison.net.predicted)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Actual paystub net</dt>
          <dd className="mt-1 font-medium tabular-nums">{formatMoney(comparison.net.actual)}</dd>
        </div>
      </dl>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-slate-400">Gross and deduction differences</summary>
        <div className="mt-2 space-y-2">
          {[
            { label: 'Gross', values: comparison.gross },
            { label: 'Total deductions', values: comparison.deductions },
          ].map(({ label, values }) => (
            <p key={label} className="text-slate-400">
              {label}: {formatMoney(values.predicted)} estimated / {formatMoney(values.actual)}{' '}
              actual
              {values.predicted !== null && values.actual !== null
                ? ` / ${formatMoney(Math.abs(values.actual - values.predicted))} ${values.actual >= values.predicted ? 'higher' : 'lower'}`
                : ''}
            </p>
          ))}
        </div>
      </details>
      <p className="mt-3 text-[11px] text-slate-500">
        This reviewed paycheck informs new estimates for this employer only. Saved forecasts stay
        unchanged. Paystub net is separate from deposit confirmation.
      </p>
    </section>
  )
}
