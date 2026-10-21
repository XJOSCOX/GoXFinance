import { ArrowDownLeft, Clock3, Wallet } from 'lucide-react'
import { formatMoney } from '../../../lib/money'
export function IncomeMonthSummary({
  net,
  gross,
  deductions,
  received,
  pending,
  month,
  missing,
}: {
  net: number
  gross: number | null
  deductions: number | null
  received: number
  pending: number
  month: string
  missing: number
}) {
  return (
    <section
      aria-label="Monthly income summary"
      className="grid overflow-hidden rounded-2xl border border-white/10 bg-[#1b211e] lg:grid-cols-[1.2fr_2fr]"
    >
      <div className="flex items-center gap-4 p-5 sm:p-6">
        <span className="rounded-xl bg-emerald-300/10 p-3 text-emerald-300">
          <ArrowDownLeft size={23} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs text-slate-400">
            Take-home pay <span className="text-slate-500">/ {month}</span>
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-emerald-200 tabular-nums">
            {formatMoney(net)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {received} received {received === 1 ? 'paycheck' : 'paychecks'}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-white/8 border-t border-white/8 lg:items-center lg:border-l lg:border-t-0">
        <div className="min-w-0 p-3 sm:p-5">
          <dt className="text-xs text-slate-400">Gross pay</dt>
          <dd className="mt-2 text-base font-medium tabular-nums sm:text-xl">
            {formatMoney(gross)}
          </dd>
          <dd className="mt-1 text-[11px] text-slate-500">Before deductions</dd>
        </div>
        <div className="min-w-0 p-3 sm:p-5">
          <dt className="text-xs text-slate-400">Deductions</dt>
          <dd className="mt-2 text-base font-medium tabular-nums sm:text-xl">
            {formatMoney(deductions)}
          </dd>
          <dd className="mt-1 text-[11px] text-slate-500">Taxes & benefits</dd>
        </div>
        <div className="min-w-0 p-3 sm:p-5">
          <dt className="flex items-center gap-1.5 text-xs text-slate-400">
            {pending ? (
              <Clock3 size={13} aria-hidden="true" />
            ) : (
              <Wallet size={13} aria-hidden="true" />
            )}
            Awaiting
          </dt>
          <dd
            className={`mt-2 text-base font-medium sm:text-xl ${pending ? 'text-amber-200' : 'text-slate-300'}`}
          >
            {pending}
          </dd>
          <dd className="mt-1 text-[11px] text-slate-500">Not received / all dates</dd>
        </div>
      </dl>
      {missing > 0 && (
        <p className="border-t border-white/8 px-5 py-2 text-xs text-amber-200 lg:col-span-2">
          Gross or deductions are missing for {missing} confirmed{' '}
          {missing === 1 ? 'paycheck' : 'paychecks'}. Totals include known amounts only.
        </p>
      )}
    </section>
  )
}
