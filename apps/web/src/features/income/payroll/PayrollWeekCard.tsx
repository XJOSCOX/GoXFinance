import { payrollMilestones, type PayrollWeek, type PayrollProfile } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function PayrollWeekCard({
  week: w,
  profile,
  edit,
  upload,
  review,
  confirm,
  pending,
  busy,
}: {
  week: PayrollWeek
  profile: PayrollProfile
  edit: () => void
  upload: () => void
  review: () => void
  confirm: () => void
  pending: () => void
  busy: boolean
}) {
  const f = w.forecasts.at(-1),
    milestones = payrollMilestones(w.workweekEnd, profile)
  return (
    <Card className="p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {w.workweekStart} — {w.workweekEnd}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {w.stage.replaceAll('_', ' ')} · Expected deposit {w.expectedPayDate}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">
            Estimated net · {f?.result.confidence ?? 'unknown'} confidence
          </p>
          <p className="text-xl font-semibold text-emerald-200">
            {formatMoney(f?.result.netCents ?? null)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <p>
          Worked{' '}
          <strong>
            {(f?.result.workedHundredths ?? w.regularHundredths + w.overtimeHundredths) / 100} h
          </strong>{' '}
          · Paid <strong>{(f?.result.paidHundredths ?? 0) / 100} h</strong>
        </p>
        <p>
          Forecast gross <strong>{formatMoney(f?.result.grossCents ?? null)}</strong>
        </p>
        <p>
          Documented net <strong>{formatMoney(w.statement?.netCents ?? null)}</strong>
        </p>
      </div>
      {f?.result.range && (
        <p className="mt-2 text-xs text-slate-400">
          Observed-error range {formatMoney(f.result.range.lowCents)}–
          {formatMoney(f.result.range.highCents)} · {f.result.range.sampleCount} prior errors; not a
          guaranteed interval.
        </p>
      )}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-slate-300">
          Forecast details and expected milestones
        </summary>
        <p className="mt-2 text-slate-400">
          Hours {milestones.hours} · Processing {milestones.processing} · Paystub{' '}
          {milestones.statement} · Usual deposit {milestones.deposit}. Exceptions use the expected
          date above.
        </p>
        {f?.result.deductions.map((d) => (
          <div key={d.code} className="mt-2 flex justify-between gap-3">
            <span>
              {d.label}
              <span className="block text-slate-500">
                {d.method} · {d.sampleCount} samples
              </span>
            </span>
            <span>{formatMoney(d.amountCents)}</span>
          </div>
        ))}
        {f?.result.warnings.map((v, i) => (
          <p key={i} className="mt-2 text-amber-200">
            {v}
          </p>
        ))}
        <p className="mt-2 text-slate-500">
          Saved model {f?.modelVersion ?? '—'} · {w.forecasts.length} immutable forecast versions.
        </p>
      </details>
      {w.canManage && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {!w.statementReceivedAt && (
            <Button size="small" disabled={busy} onClick={edit}>
              Edit hours
            </Button>
          )}
          {w.stage === 'hours_submitted' && (
            <Button size="small" disabled={busy} onClick={pending}>
              Payroll processing
            </Button>
          )}
          {w.statement && (
            <Button size="small" disabled={busy} onClick={review}>
              View / correct statement
            </Button>
          )}
          <Button size="small" disabled={busy} onClick={upload}>
            Upload paystub
          </Button>
          {['paystub_reviewed', 'deposit_confirmed'].includes(w.stage) && (
            <Button size="small" variant="primary" disabled={busy} onClick={confirm}>
              {w.stage === 'deposit_confirmed'
                ? 'Correct actual deposit'
                : 'Confirm actual deposit'}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
