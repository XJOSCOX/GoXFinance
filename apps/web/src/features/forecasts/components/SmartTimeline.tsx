import { useState } from 'react'
import type { ForecastReport } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { formatMoney } from '../../../lib/money'

export function SmartTimeline({ report }: { report: ForecastReport }) {
  const [selected, setSelected] = useState('')
  const index = Math.max(
    0,
    report.days.findIndex((d) => d.date === selected),
  )
  const day = report.days[index]
  if (!day) return null
  const unknownEvents = report.events.filter((e) => e.date === day.date && e.amountCents === null)
  const hasCash = !report.smart?.openingRequired
  const values = report.days.map((d) => (hasCash ? (d.knownSubtotalCents ?? 0) : d.netChangeCents))
  const buffer = report.smart?.bufferCents ?? 0
  const min = Math.min(0, ...values),
    max = Math.max(1, hasCash ? buffer : 0, ...values)
  const x = (i: number) => 16 + (i / Math.max(1, values.length - 1)) * 568
  const y = (value: number) => 176 - ((value - min) / (max - min)) * 152
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {hasCash ? 'Daily cash projection' : 'Known net changes'}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {report.incomplete ? 'Incomplete · known amounts only' : 'Estimated daily balances'} ·
            Daily order of deposits and payments is not verified.
          </p>
        </div>
        <FormField label="Inspect day">
          <Select value={day.date} onChange={(e) => setSelected(e.target.value)}>
            {report.days.map((d) => (
              <option key={d.date}>{d.date}</option>
            ))}
          </Select>
        </FormField>
      </div>
      <svg
        viewBox="0 0 600 200"
        className="mt-3 w-full"
        role="group"
        aria-label="Interactive daily cash timeline"
      >
        <line x1="16" x2="584" y1={y(0)} y2={y(0)} stroke="#64748b" strokeDasharray="3 5" />
        {hasCash && (
          <>
            <line
              x1="16"
              x2="584"
              y1={y(buffer)}
              y2={y(buffer)}
              stroke="#fbbf24"
              strokeDasharray="5 4"
            />
            <text x="20" y={Math.max(14, y(buffer) - 5)} fill="#fbbf24" fontSize="10">
              Safety buffer {formatMoney(buffer)}
            </text>
          </>
        )}
        <polyline
          points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          fill="none"
          stroke="#93c5fd"
          strokeWidth="2.5"
          strokeDasharray={report.incomplete ? '6 4' : undefined}
        />
        {values.map((v, i) => (
          <g
            key={report.days[i].date}
            role="button"
            tabIndex={0}
            aria-label={`${report.days[i].date}: ${hasCash ? 'known cash subtotal' : 'net change'} ${formatMoney(v)}`}
            onFocus={() => setSelected(report.days[i].date)}
            onMouseEnter={() => setSelected(report.days[i].date)}
            onClick={() => setSelected(report.days[i].date)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setSelected(report.days[i].date)
              }
            }}
          >
            <circle cx={x(i)} cy={y(v)} r="8" fill="transparent" />
            <circle
              cx={x(i)}
              cy={y(v)}
              r={i === index ? 5 : 2.5}
              fill={v < 0 ? '#fda4af' : '#93c5fd'}
            />
            {(report.days[i].confirmedInCents ?? 0) > 0 && (
              <circle cx={x(i) - 3} cy="192" r="3" fill="#6ee7b7" />
            )}
            {(report.days[i].expectedInCents ?? 0) > 0 && (
              <circle cx={x(i) + 3} cy="192" r="3" fill="none" stroke="#93c5fd" />
            )}
            {(report.days[i].estimatedOutCents ?? 0) +
              (report.days[i].scheduledOutCents ?? 0) +
              (report.days[i].allowanceCents ?? 0) >
              0 && <path d={`M${x(i)},181 l-3,5 h6 z`} fill="#fbbf24" />}
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{report.days[0].date}</span>
        <span>{report.days.at(-1)?.date}</span>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span className="text-emerald-300">● Confirmed inflow</span>
        <span className="text-sky-300">○ Expected inflow</span>
        <span className="text-amber-200">▲ Outgoing cash / obligation</span>
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-xs sm:grid-cols-4">
        {[
          ['Opening cash', day.openingCents],
          ['Confirmed inflows', day.confirmedInCents],
          ['Expected inflows', day.expectedInCents],
          ['Scheduled / pending', day.scheduledOutCents],
          ['Other obligations / cash activity', day.estimatedOutCents],
          ['Spending allowance', day.allowanceCents],
          [
            report.incomplete ? 'Known cash subtotal' : 'Ending cash',
            hasCash ? day.knownSubtotalCents : null,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-slate-400">{label}</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {formatMoney((value as number | null | undefined) ?? null)}
              {unknownEvents.length &&
              [
                'Confirmed inflows',
                'Expected inflows',
                'Scheduled / pending',
                'Other obligations / cash activity',
              ].includes(String(label))
                ? ' (known subtotal)'
                : ''}
            </dd>
          </div>
        ))}
        <div>
          <dt className="text-slate-400">Next expected paycheck</dt>
          <dd className="mt-1">
            {day.daysUntilPaycheck == null ? 'Date unknown' : `${day.daysUntilPaycheck} days`}
          </dd>
        </div>
      </dl>
      {unknownEvents.length > 0 && (
        <p className="mt-3 text-xs text-amber-200">
          Unknown amounts excluded above: {unknownEvents.map((e) => e.name).join(', ')}. These are
          not zero-value events.
        </p>
      )}
    </Card>
  )
}
