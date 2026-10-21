import type { PayrollForecast, WeeklyHoursInput } from '@goxfinance/shared'
import { payrollHoursText } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'
export function PayrollForecastExplanation({
  forecast: f,
  hours: h,
}: {
  forecast: PayrollForecast
  hours: WeeklyHoursInput
}) {
  const time = (kind: 'regular' | 'overtime' | 'pto' | 'holiday' | 'otherPaid') =>
    payrollHoursText(h[`${kind}Hundredths`], h[`${kind}Minutes`])
  const rate = (kind: string) => (kind === 'overtime' ? h.overtimeRateCents : h.regularRateCents)
  const total = f.deductions.every((d) => d.amountCents !== null)
    ? f.deductions.reduce((n, d) => n + d.amountCents!, 0)
    : null
  return (
    <details className="mt-4 border-t border-white/10 pt-3 text-xs">
      <summary className="cursor-pointer font-medium text-slate-300">
        How this estimate is calculated
      </summary>
      <div className="mt-3 space-y-4">
        <p className="text-slate-400">
          Expected deposit: {h.expectedPayDate ?? 'Unknown'} · {f.confidence} confidence ·{' '}
          {f.explanation?.sampleCount ?? 'Unknown'} prior samples
        </p>
        <section aria-label="Forecast earnings">
          <h3 className="font-semibold">Earnings</h3>
          {f.earnings
            .filter((e) => e.amountCents !== 0)
            .map((e, i) => (
              <div key={i} className="mt-2 flex justify-between gap-3">
                <div>
                  <p>{e.label ?? e.code.replaceAll('_', ' ')}</p>
                  <p className="text-slate-500">
                    {['regular', 'overtime', 'pto', 'holiday', 'other_paid'].includes(e.code)
                      ? `${time((e.code === 'other_paid' ? 'otherPaid' : e.code) as 'regular')} ${h[`${e.code === 'other_paid' ? 'otherPaid' : e.code}Minutes` as 'regularMinutes'] !== undefined ? '(clock time)' : 'decimal hours'} x ${formatMoney(rate(e.code))}/hour. `
                      : ''}
                    {e.method ?? 'Original saved forecast component'}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">{formatMoney(e.amountCents)}</span>
              </div>
            ))}
          <p className="mt-2 flex justify-between border-t border-white/10 pt-2 font-semibold">
            <span>Expected gross</span>
            <span>{formatMoney(f.grossCents)}</span>
          </p>
        </section>
        <section aria-label="Forecast deductions">
          <h3 className="font-semibold">Employee deductions</h3>
          {f.deductions.map((d, i) => (
            <div key={i} className="mt-2 flex justify-between gap-3">
              <div>
                <p>{d.label}</p>
                <p className="text-slate-500">
                  {d.method}
                  {d.sampleCount ? ` · ${d.sampleCount} samples` : ''}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">{formatMoney(d.amountCents)}</span>
            </div>
          ))}
          <p className="mt-2 flex justify-between border-t border-white/10 pt-2 font-semibold">
            <span>Total estimated deductions</span>
            <span>{formatMoney(total)}</span>
          </p>
        </section>
        <p className="flex justify-between font-semibold text-sky-200">
          <span>Estimated take-home</span>
          <span>{formatMoney(f.netCents)}</span>
        </p>
        <p className="text-slate-500">
          {f.explanation?.timeBasis ??
            'Historical snapshot; original calculation methods are retained.'}{' '}
          Assumptions describe an estimate, not guaranteed withholding or a bank deposit.
        </p>
        {f.warnings.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-amber-200">
            {f.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
