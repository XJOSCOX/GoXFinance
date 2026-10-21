import {
  payrollStatementHours,
  incomeFrequencyLabels,
  type IncomeTransaction,
  type IncomeSource,
  type PayrollWeek,
} from '@goxfinance/shared'
import { incomeDisplayDate, incomeDisplayPeriod } from './income-display'
import { ReceiptText } from 'lucide-react'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function LatestPaycheck({
  transaction: t,
  source,
  week,
  member,
  label = 'Latest paycheck',
}: {
  transaction?: IncomeTransaction
  source?: IncomeSource
  week?: PayrollWeek
  member?: string
  label?: string
}) {
  if (!t)
    return (
      <Card className="p-6">
        <ReceiptText size={22} className="text-slate-500" />
        <h2 className="mt-3 font-semibold">Your next paycheck starts here</h2>
        <p className="mt-2 text-sm text-slate-400">
          Upload a paystub to review earnings, taxes, deductions and the expected deposit.
        </p>
      </Card>
    )
  const s = week?.statement,
    hours = s ? payrollStatementHours(s) : null,
    confirmed = t.status === 'confirmed'
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 p-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
          <h2 className="mt-2 text-lg font-semibold">{source?.name ?? 'Income source'}</h2>
          <p className="mt-1 text-xs text-slate-400">
            {incomeFrequencyLabels[t.frequencySnapshot] ?? 'Recorded pay'}
            {member ? ' / ' + member : ''}
          </p>
        </div>
        <div className="text-right">
          <span
            className={`rounded-full border px-2 py-1 text-xs ${confirmed ? 'border-emerald-300/15 bg-emerald-300/5 text-emerald-300' : 'border-amber-300/15 bg-amber-300/5 text-amber-200'}`}
          >
            {confirmed ? 'Received' : t.status === 'cancelled' ? 'Cancelled' : 'Awaiting receipt'}
          </span>
          <p className="mt-3 text-2xl font-semibold tabular-nums">
            {formatMoney(confirmed ? t.actualNetCents : (s?.netCents ?? t.actualNetCents))}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {confirmed ? 'Actual net deposit' : 'Documented net, not received'}
          </p>
          {confirmed &&
            s?.netCents !== null &&
            s?.netCents !== undefined &&
            s.netCents !== t.actualNetCents && (
              <p className="mt-1 text-xs text-amber-200">Statement net {formatMoney(s.netCents)}</p>
            )}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Work period</dt>
          <dd className="mt-1">{incomeDisplayPeriod(t.workPeriodStart, t.workPeriodEnd)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Pay date / deposit</dt>
          <dd className="mt-1">
            {incomeDisplayDate(t.payDate)}
            <span className="mt-1 block text-xs text-slate-400">
              {confirmed && t.depositDate ? incomeDisplayDate(t.depositDate) : 'Not received yet'}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Gross / deductions</dt>
          <dd className="mt-1">
            {formatMoney(t.actualGrossCents)}
            <span className="mt-1 block text-xs text-slate-400">
              {formatMoney(t.deductionsCents)} deducted
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Worked / paid hours</dt>
          <dd className="mt-1">
            {hours?.workedHundredths == null
              ? 'Unknown'
              : (hours.workedHundredths / 100).toFixed(2)}{' '}
            / {hours?.paidHundredths == null ? 'Unknown' : (hours.paidHundredths / 100).toFixed(2)}
          </dd>
        </div>
      </dl>
      {s && (
        <div className="grid gap-px border-t border-white/8 bg-white/8 sm:grid-cols-2">
          {[
            { side: 'earnings', label: 'Earnings' },
            { side: 'deduction', label: 'Taxes & deductions' },
          ].map((group) => {
            const lines = s.lines.filter((l) => l.side === group.side)
            return (
              <details key={group.side} className="bg-[#1b1d1c] p-5">
                <summary className="cursor-pointer text-sm font-medium">
                  {group.label}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {lines.length} components
                  </span>
                </summary>
                <dl className="mt-3 space-y-3">
                  {lines.map((l, i) => (
                    <div key={i} className="flex justify-between gap-3 text-xs">
                      <div>
                        <dt className="text-slate-300">{l.label}</dt>
                        {l.hoursHundredths !== null && (
                          <dd className="mt-1 text-slate-500">
                            {(l.hoursHundredths / 100).toFixed(2)} hours
                            {l.rateCents !== null ? ' at ' + formatMoney(l.rateCents) : ''}
                          </dd>
                        )}
                      </div>
                      <dd className="tabular-nums">{formatMoney(l.currentCents)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )
          })}
        </div>
      )}
    </Card>
  )
}
