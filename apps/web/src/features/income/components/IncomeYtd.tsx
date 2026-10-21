import { payrollTaxReport, type PayrollWeek, type IncomeSource } from '@goxfinance/shared'
import { incomeDisplayDate } from './income-display'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function IncomeYtd({
  weeks,
  year,
  sources,
  loading,
  error,
}: {
  weeks: PayrollWeek[]
  year: string
  sources: IncomeSource[]
  loading: boolean
  error: string
}) {
  const report = payrollTaxReport(weeks),
    rows = report.latestYtd.filter((r) => r.year === year && r.side === 'deduction'),
    earnings = report.latestYtd.filter((r) => r.year === year && r.side === 'earnings'),
    featured = rows.filter((r) =>
      ['federal', 'social_security', 'medicare', 'roth', 'traditional'].includes(r.code),
    ),
    other = rows.filter((r) => !featured.includes(r))
  const render = (items: typeof rows) => (
    <dl className="mt-4 divide-y divide-white/8">
      {items.map((r, i) => (
        <div key={i} className="flex justify-between gap-3 py-2.5 text-sm">
          <div>
            <dt className="text-slate-300">{r.label}</dt>
            <dd className="mt-1 text-[11px] text-slate-500">
              {sources.length > 1
                ? (sources.find((s) => s.id === r.sourceId)?.name ?? 'Employer') + ' / '
                : ''}
              {incomeDisplayDate(r.payDate, false)}
            </dd>
          </div>
          <dd className="tabular-nums">{formatMoney(r.amountCents)}</dd>
        </div>
      ))}
    </dl>
  )
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Year to date</h2>
        <span className="text-xs text-slate-400">{year} YTD</span>
      </div>
      {loading ? (
        <p role="status" className="mt-4 text-sm text-slate-400">
          Loading statement details...
        </p>
      ) : error ? (
        <p role="alert" className="mt-4 text-sm text-amber-200">
          Statement details unavailable. {error}
        </p>
      ) : !rows.length && !earnings.length ? (
        <p className="mt-4 text-sm text-slate-400">
          Review a paystub to see reported withholding and retirement contributions.
        </p>
      ) : (
        <>
          {render(featured)}
          {other.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-slate-400">
                Other deductions ({other.length})
              </summary>
              {render(other)}
            </details>
          )}
          {earnings.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-slate-400">
                Reported earnings ({earnings.length})
              </summary>
              {render(earnings)}
            </details>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            Latest reported value for each employer and component. Signed amounts follow the
            paystub; YTD is never added across paychecks.
          </p>
        </>
      )}
    </Card>
  )
}
