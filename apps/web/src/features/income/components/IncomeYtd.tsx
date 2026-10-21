import {
  payrollTaxReport,
  combinedPayrollYtd,
  type PayrollWeek,
  type IncomeSource,
} from '@goxfinance/shared'
import { incomeDisplayDate } from './income-display'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { useState } from 'react'
import { FormField, Select } from '../../../components/ui/FormField'
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
  const [selection, setSelection] = useState<string | null>(null)
  const allowed = new Set(sources.map((s) => s.id)),
    report = payrollTaxReport(weeks.filter((w) => allowed.has(w.sourceId))),
    yearRows = report.latestYtd.filter((r) => r.year === year),
    selected = selection === 'all' || sources.some((s) => s.id === selection) ? selection! : 'all',
    visible =
      selected === 'all'
        ? combinedPayrollYtd(yearRows)
        : yearRows
            .filter((r) => r.sourceId === selected)
            .map((r) => ({ ...r, employerCount: 1, missingCount: r.amountCents === null ? 1 : 0 })),
    rows = visible.filter((r) => r.side === 'deduction' && r.amountCents !== null),
    missing = visible.filter((r) => r.amountCents === null),
    earnings = visible.filter((r) => r.side === 'earnings' && r.amountCents !== null),
    featured = rows.filter((r) =>
      ['federal', 'social_security', 'medicare', 'roth', 'traditional'].includes(r.code),
    ),
    other = rows.filter((r) => !featured.includes(r))
  const render = (items: typeof rows, compact = false) => (
    <dl
      className={
        compact
          ? 'mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5'
          : 'mt-3 divide-y divide-white/8'
      }
    >
      {items.map((r, i) => (
        <div
          key={i}
          className={
            compact
              ? 'rounded-lg border border-white/8 bg-white/[0.02] p-3 text-sm'
              : 'flex justify-between gap-3 py-2 text-sm'
          }
        >
          <div>
            <dt className="text-slate-300">{r.label}</dt>
            <dd className="mt-1 text-[11px] text-slate-500">
              {selected === 'all'
                ? `${r.employerCount} employer${r.employerCount === 1 ? '' : 's'} / `
                : ''}
              {incomeDisplayDate(r.payDate, false)}
            </dd>
          </div>
          <dd
            className={
              compact ? 'mt-2 text-lg font-semibold tabular-nums' : 'text-right tabular-nums'
            }
          >
            {formatMoney(r.amountCents)}
            {selected === 'all' && r.missingCount > 0 && r.amountCents !== null && (
              <span className="block text-[11px] text-amber-200">
                Reported subtotal · {r.missingCount} not reported
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Year to date</h2>
          <span className="text-xs text-slate-400">{year} YTD</span>
        </div>
        {sources.length > 0 && (
          <div className="w-full sm:w-72">
            <FormField label="YTD employer">
              <Select
                aria-label="YTD employer"
                value={selected}
                onChange={(e) => setSelection(e.target.value)}
              >
                <option value="all">All employers</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        )}
      </div>
      {loading ? (
        <p role="status" className="mt-4 text-sm text-slate-400">
          Loading statement details...
        </p>
      ) : error ? (
        <p role="alert" className="mt-4 text-sm text-amber-200">
          Statement details unavailable. {error}
        </p>
      ) : !visible.length ? (
        <p className="mt-4 text-sm text-slate-400">
          Review a paystub to see reported withholding and retirement contributions.
        </p>
      ) : (
        <>
          {render(featured, true)}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {other.length > 0 && (
              <details className="min-w-0 text-sm">
                <summary className="cursor-pointer text-slate-400">
                  Other deductions ({other.length})
                </summary>
                {render(other)}
              </details>
            )}
            {earnings.length > 0 && (
              <details className="min-w-0 text-sm">
                <summary className="cursor-pointer text-slate-400">
                  Reported earnings ({earnings.length})
                </summary>
                {render(earnings)}
              </details>
            )}
            {missing.length > 0 && (
              <details className="min-w-0 text-sm">
                <summary className="cursor-pointer text-slate-400">
                  YTD not reported ({missing.length})
                </summary>
                {render(missing)}
              </details>
            )}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            {selected === 'all'
              ? 'Combined latest YTD per employer. Deductions show amounts withheld; credits reduce them. Unknown amounts are excluded and flagged.'
              : 'Latest reported value for this employer. Signed amounts follow the paystub.'}{' '}
            YTD is never added across paychecks.
          </p>
        </>
      )}
    </Card>
  )
}
