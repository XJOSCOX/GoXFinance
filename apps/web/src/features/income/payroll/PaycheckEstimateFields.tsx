import { useState } from 'react'
import {
  payrollForecast,
  payrollForecastContext,
  payrollFrequencyLabels,
  type PayrollForecast,
  type PayrollProfile,
  type PayrollWeek,
} from '@goxfinance/shared'
import { DateField, AmountField } from '../../../components/financial/EntryFields'
import { PayrollTimeField } from './PayrollTimeField'
import { formatMoney } from '../../../lib/money'
import { paycheckEstimateHours } from './paycheck-estimate'
export function PaycheckEstimateFields({
  profile,
  weeks,
}: {
  profile: PayrollProfile
  weeks: PayrollWeek[]
}) {
  const [forecast, setForecast] = useState<PayrollForecast | null>(null)
  return (
    <div
      className="space-y-5"
      onChange={(e) => {
        const form = e.currentTarget.closest('form')
        if (form)
          try {
            const hours = paycheckEstimateHours(new FormData(form), profile),
              ctx = payrollForecastContext(weeks, hours, new Date().toISOString())
            setForecast(payrollForecast(profile, hours, ctx.samples, ctx.errors))
          } catch {
            setForecast(null)
          }
      }}
    >
      <p className="text-xs text-slate-400">
        {payrollFrequencyLabels[profile.payFrequency ?? 'weekly']} payroll. Choose full dates for
        the hours you want to estimate. Enter hours and minutes separately, just as shown in Deputy.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField label="Work period starts" name="start" required />
        <DateField label="Work period ends" name="end" required />
        <DateField label="Expected payday" name="payDate" required />
        <AmountField
          label="Hourly rate ($)"
          name="regularRate"
          value={profile.regularRateCents}
          required
        />
        <PayrollTimeField label="Regular" name="regular" required />
        <PayrollTimeField label="Overtime" name="overtime" zero />
        <AmountField
          label="Overtime rate ($)"
          name="overtimeRate"
          value={profile.overtimeRateCents}
        />
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-slate-400">Paid time off & bonus</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <PayrollTimeField label="Paid time off" name="pto" zero />
          <AmountField label="Bonus ($)" name="bonus" />
        </div>
      </details>
      <label className="flex items-start gap-2 text-sm text-slate-300">
        <input type="checkbox" name="useHistory" defaultChecked className="mt-1" />
        <span>
          Use reviewed paystubs to estimate deductions when tax rules are incomplete
          <span className="mt-1 block text-xs text-slate-500">
            Prior paychecks from this employer and pay frequency only. Actual withholding may
            differ.
          </span>
        </span>
      </label>
      <section
        aria-label="Paycheck estimate"
        aria-live="polite"
        className="rounded-xl border border-sky-300/15 bg-sky-300/5 p-4"
      >
        <p className="text-xs font-medium uppercase tracking-wider text-sky-200">
          Projected paycheck / not received
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-400">Estimated gross</dt>
            <dd className="mt-1 text-xl font-semibold">
              {formatMoney(forecast?.grossCents ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Estimated deductions</dt>
            <dd className="mt-1 text-xl font-semibold">
              {formatMoney(
                forecast && forecast.deductions.every((d) => d.amountCents !== null)
                  ? forecast.deductions.reduce((n, d) => n + d.amountCents!, 0)
                  : null,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Estimated take-home</dt>
            <dd className="mt-1 text-xl font-semibold text-sky-200">
              {formatMoney(forecast?.netCents ?? null)}
            </dd>
          </div>
        </dl>
        {!forecast ? (
          <p className="mt-3 text-xs text-slate-400">
            Enter valid dates, hours and a rate to see your estimate.
          </p>
        ) : (
          <>
            <p className="mt-3 text-xs text-slate-400">
              {forecast.confidence === 'unknown'
                ? 'Take-home is unknown until deductions can be estimated.'
                : `${forecast.confidence} confidence. This is an estimate, not a guaranteed deposit or tax calculation.`}
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-400">
                Assumptions & deduction details
              </summary>
              <ul className="mt-2 space-y-2 text-xs text-slate-400">
                {forecast.deductions.map((d) => (
                  <li key={d.code}>
                    {d.label}: {formatMoney(d.amountCents)} / {d.method}
                    {d.sampleCount ? ` (${d.sampleCount} samples)` : ''}
                  </li>
                ))}
                {forecast.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </section>
      <p className="text-xs text-slate-500">
        Saving creates a payroll forecast only. Upload the statement and confirm receipt later to
        record actual income. A period that already exists must be edited from Payroll.
      </p>
    </div>
  )
}
