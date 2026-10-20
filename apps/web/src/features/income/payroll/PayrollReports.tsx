import { payrollComparison, payrollTaxReport, type PayrollWeek } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function PayrollReports({ weeks }: { weeks: PayrollWeek[] }) {
  const report = payrollTaxReport(weeks)
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs text-slate-400">Reviewed gross compensation</p>
          <p className="mt-1 text-xl font-semibold">{formatMoney(report.grossCents)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-400">Documented net (not necessarily deposited)</p>
          <p className="mt-1 text-xl font-semibold">{formatMoney(report.documentedNetCents)}</p>
        </Card>
      </div>
      <Card className="p-4">
        <h3 className="font-semibold">Taxes & deductions</h3>
        <p className="mt-1 text-xs text-slate-400">
          Employee withholding is separate from employer taxes. These are payroll observations, not
          annual tax liability or a refund prediction.
        </p>
        {report.periods.length === 0 && (
          <p className="py-4 text-sm text-slate-400">
            Review a statement to begin withholding history.
          </p>
        )}
        {report.periods.map((p) => (
          <details key={p.weekId} className="mt-3 border-t border-white/10 pt-3">
            <summary className="cursor-pointer text-sm">
              {p.payDate} · Gross {formatMoney(p.grossCents)} · Net {formatMoney(p.netCents)}
            </summary>
            <div className="mt-3 space-y-2">
              {[...p.employeeWithholding, ...p.employerTaxes].map((l, i) => (
                <div key={i} className="flex justify-between gap-3 text-xs">
                  <span>
                    {l.label} {l.side === 'employer_tax' ? '(employer)' : '(employee)'}
                  </span>
                  <span>{formatMoney(l.currentCents)}</span>
                </div>
              ))}
            </div>
          </details>
        ))}
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold">Latest YTD observations</h3>
        <p className="mt-1 text-xs text-slate-400">
          Latest dated value per source, year and component; never summed across paystubs.
        </p>
        {report.latestYtd.map((r, i) => (
          <div key={i} className="mt-3 flex justify-between gap-3 text-xs">
            <span>
              {r.label} · {r.side.replaceAll('_', ' ')} · {r.payDate}
            </span>
            <span>{formatMoney(r.amountCents)}</span>
          </div>
        ))}
        <details className="mt-4 text-xs text-amber-200">
          <summary className="cursor-pointer">YTD checks · {report.warnings.length}</summary>
          {report.warnings.map((w, i) => (
            <p className="mt-1" key={i}>
              {w}
            </p>
          ))}
        </details>
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold">Forecast versus actual</h3>
        <p className="mt-1 text-xs text-slate-400">
          Only forecasts saved before the document arrived and before an overdue payday qualify.
          Historical uploads are not scored as prior predictions.
        </p>
        {weeks.map((w) => {
          const c = payrollComparison(w)
          return c ? (
            <details key={w.id} className="mt-3 border-t border-white/10 pt-3">
              <summary className="cursor-pointer text-sm">
                {w.workweekStart} · Net error {formatMoney(c.errorCents)}{' '}
                {c.errorPercent === null ? '' : `(${c.errorPercent}%)`}
              </summary>
              <div className="mt-3 space-y-2">
                {(
                  ['gross', 'federal', 'fica', 'otherDeductions', 'deductions', 'net'] as const
                ).map((k) => (
                  <div className="flex justify-between text-xs" key={k}>
                    <span>{k}</span>
                    <span>
                      {formatMoney(c[k].predicted)} forecast / {formatMoney(c[k].actual)} actual
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null
        })}
      </Card>
    </div>
  )
}
