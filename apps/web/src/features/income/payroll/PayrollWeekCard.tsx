import {
  payrollMilestones,
  payrollStatementHours,
  payrollFrequencyLabels,
  payrollHoursText,
  type PayrollWeek,
  type PayrollProfile,
  type IncomeTransaction,
} from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { PayrollDepositConfirmation, type PayrollReceipt } from './PayrollDepositConfirmation'
import { ActionMenu, type MenuAction } from '../../../components/ui/ActionMenu'
import { formatMoney } from '../../../lib/money'
export function PayrollWeekCard({
  week: w,
  profile,
  edit,
  upload,
  review,
  confirm,
  receive,
  pending,
  busy,
  transaction,
}: {
  week: PayrollWeek
  profile: PayrollProfile
  edit: () => void
  upload: () => void
  review: () => void
  receive: (values: PayrollReceipt) => Promise<void>
  confirm: () => void
  pending: () => void
  busy: boolean
  transaction?: IncomeTransaction
}) {
  const f = w.forecasts.at(-1),
    milestones = payrollMilestones(w.workweekEnd, {
      ...profile,
      payFrequency: w.payFrequency ?? 'weekly',
    }),
    actual = w.statement ? payrollStatementHours(w.statement) : null,
    worked = w.statement ? actual?.workedHundredths : f?.result.workedHundredths,
    paid = w.statement ? actual?.paidHundredths : f?.result.paidHundredths
  return (
    <Card className="p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {w.workweekStart} — {w.workweekEnd}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {payrollFrequencyLabels[w.payFrequency ?? 'weekly']} · {w.stage.replaceAll('_', ' ')} ·
            {w.statement ? 'Printed payday' : 'Expected deposit'}{' '}
            {w.statement?.payDate ?? w.expectedPayDate ?? 'Unknown'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">
            {!w.statement && f
              ? `Estimated net · ${f.result.confidence} confidence`
              : 'Documented net · not deposit confirmation'}
          </p>
          <p className="text-xl font-semibold text-emerald-200">
            {formatMoney(w.statement ? w.statement.netCents : (f?.result.netCents ?? null))}
          </p>
        </div>
      </div>
      {w.forecastPeriodReconciled && (
        <p className="mt-3 text-xs text-slate-400">
          Statement dates reconciled with the saved draft. The original forecast is retained but
          excluded from accuracy comparisons because the period changed.
        </p>
      )}
      {!actual && (w.regularMinutes !== undefined || w.overtimeMinutes !== undefined) && (
        <p className="mt-3 text-xs text-slate-400">
          Entered time: regular {payrollHoursText(w.regularHundredths, w.regularMinutes)} / overtime{' '}
          {payrollHoursText(w.overtimeHundredths, w.overtimeMinutes)}. Pay uses exact entered
          minutes.
        </p>
      )}
      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <p>
          Worked{' '}
          <strong>
            {worked === undefined || worked === null ? 'Unknown' : `${worked / 100} h`}
          </strong>{' '}
          · Paid{' '}
          <strong>{paid === undefined || paid === null ? 'Unknown' : `${paid / 100} h`}</strong>
        </p>
        <p>
          {f ? 'Forecast gross' : 'Documented gross'}{' '}
          <strong>
            {formatMoney(f ? f.result.grossCents : (w.statement?.grossCents ?? null))}
          </strong>
        </p>
        <p>
          {f ? 'Documented net' : 'Actual deposit'}{' '}
          <strong>
            {f
              ? formatMoney(w.statement?.netCents ?? null)
              : transaction?.status === 'confirmed'
                ? formatMoney(transaction.actualNetCents)
                : 'Not confirmed'}
          </strong>
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
          Hours {milestones.hours ?? 'Not configured'} · Processing{' '}
          {milestones.processing ?? 'Not configured'} · Paystub{' '}
          {milestones.statement ?? 'Not configured'} · Usual deposit{' '}
          {milestones.deposit ?? 'Unknown'}. Exceptions use the expected date above.
        </p>
        {w.statement && (
          <p className="mt-2 text-slate-400">
            Statement pay date {w.statement.payDate} · Received{' '}
            {w.statementReceivedAt ? new Date(w.statementReceivedAt).toLocaleString() : 'Unknown'}.{' '}
            {w.statement.payDate !== w.expectedPayDate
              ? 'Statement date differs from expected bank deposit.'
              : ''}
          </p>
        )}
        <p className="mt-2 text-slate-400">
          Actual bank deposit{' '}
          {transaction?.status === 'confirmed' ? transaction.depositDate : 'Not confirmed'}.{' '}
          {!f ? 'No prior hours forecast was recorded.' : ''}
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
        <div className="mt-3 flex justify-end">
          <ActionMenu
            label={'Actions for payroll period ' + w.workweekStart}
            items={
              [
                ...(!w.statementReceivedAt
                  ? [{ label: 'Edit hours', onSelect: edit, disabled: busy }]
                  : []),
                ...(w.stage === 'hours_submitted'
                  ? [{ label: 'Payroll processing', onSelect: pending, disabled: busy }]
                  : []),
                ...(w.statement
                  ? [{ label: 'View / correct statement', onSelect: review, disabled: busy }]
                  : []),
                { label: 'Upload paystub', onSelect: upload, disabled: busy },
                ...(w.stage === 'deposit_confirmed'
                  ? [{ label: 'Correct actual deposit', onSelect: confirm, disabled: busy }]
                  : []),
              ] satisfies MenuAction[]
            }
          />
        </div>
      )}
      {w.canManage &&
        w.statement &&
        transaction &&
        transaction.status !== 'confirmed' &&
        transaction.status !== 'cancelled' &&
        w.stage === 'paystub_reviewed' && (
          <PayrollDepositConfirmation
            date={w.statement.payDate ?? w.expectedPayDate}
            amountCents={w.statement.netCents}
            disabled={busy}
            save={receive}
          />
        )}
    </Card>
  )
}
