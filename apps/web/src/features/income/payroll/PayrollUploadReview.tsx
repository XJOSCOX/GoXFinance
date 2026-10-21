import { useState } from 'react'
import {
  bankDecimalCents,
  payrollMilestones,
  payrollProfileSchema,
  payrollStatementHours,
  type IncomeSource,
  type PayrollUploadPreview,
  type PayrollProfileInput,
  type PayrollStatement,
} from '@goxfinance/shared'
import { PayrollReviewForm } from './PayrollReviewForm'
import { FormField, Select } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { apiRequest } from '../../../lib/api'
import { payrollBase } from './payrollClient'
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export function PayrollUploadReview({
  home,
  preview,
  sources,
  close,
  saved,
}: {
  home: string
  preview: PayrollUploadPreview
  sources: IncomeSource[]
  close: () => void
  saved: (sourceId: string) => void
}) {
  const [sourceId, setSourceId] = useState(preview.matchedSourceId ?? ''),
    [depositDay, setDepositDay] = useState(4),
    [startDay, setStartDay] = useState(1),
    [current, setCurrent] = useState(preview.statement)
  const selected = preview.sources.find((s) => s.id === sourceId),
    source = sources.find((s) => s.id === sourceId),
    profile = selected?.profile,
    hours = payrollStatementHours(preview.statement),
    regular = hours.regularRateCents ?? source?.hourlyRateCents ?? null,
    overtime =
      hours.overtimeRateCents ??
      (regular !== null ? Math.round(regular * Number(source?.overtimeMultiplier ?? '1.5')) : null),
    schedule = profile ?? {
      depositDay,
      workweekStartDay: startDay,
      hoursDay: 0,
      processingDay: 1,
      statementDay: 3,
      timezone: 'America/Chicago',
    },
    expected = current.periodEnd
      ? payrollMilestones(current.periodEnd, schedule as PayrollProfileInput).deposit
      : null
  return (
    <PayrollReviewForm
      initial={preview.statement}
      warnings={preview.warnings}
      close={close}
      onReviewChange={setCurrent}
      buildExtra={(f) => ({
        sourceId,
        profile: profile
          ? undefined
          : payrollProfileSchema.parse({
              sourceId,
              employer: String(f.get('employer') || f.get('setupEmployer') || ''),
              assignment: f.get('assignment') || null,
              regularRateCents: bankDecimalCents(String(f.get('setupRegular'))),
              overtimeRateCents: bankDecimalCents(String(f.get('setupOvertime'))),
              regularThresholdHundredths: bankDecimalCents(String(f.get('setupThreshold'))),
              ...schedule,
              hoursDay: Number(f.get('setupHoursDay')),
              processingDay: Number(f.get('setupProcessingDay')),
              statementDay: Number(f.get('setupStatementDay')),
              timezone: String(f.get('setupTimezone') || schedule.timezone),
              rules: [],
            }),
      })}
      save={async (raw) => {
        const b = raw as {
          idempotencyKey: string
          values: {
            statement: PayrollStatement
            extra: { sourceId: string; profile?: PayrollProfileInput }
          }
        }
        await apiRequest(payrollBase(home) + '/upload/save', {
          method: 'POST',
          body: JSON.stringify({
            receipt: preview.receipt,
            idempotencyKey: b.idempotencyKey,
            statement: b.values.statement,
            ...b.values.extra,
          }),
        })
        saved(b.values.extra.sourceId)
      }}
    >
      <FormField
        label={
          preview.matchedSourceId
            ? 'Matched income source'
            : 'Choose the income source for this paycheck'
        }
      >
        <Select value={sourceId} required onChange={(e) => setSourceId(e.target.value)}>
          <option value="">Select source</option>
          {preview.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </FormField>
      {selected?.existingWeek && (
        <p
          role="status"
          className="rounded-lg border border-amber-300/20 p-3 text-xs text-amber-200"
        >
          An existing paycheck matches this period (
          {selected.existingWeek.stage.replaceAll('_', ' ')}). Saving appends an audited statement
          version; previously confirmed deposits stay unchanged.
        </p>
      )}
      <p className="text-xs text-slate-400">
        Expected bank deposit {expected ?? 'Requires pay-period end'} · Received{' '}
        {new Date(preview.receivedAt).toLocaleString()}. The statement date is separate; actual
        receipt remains unconfirmed.
      </p>
      {selected && !profile && (
        <fieldset key={sourceId} className="space-y-3 rounded-lg border border-white/10 p-3">
          <legend className="px-1 text-sm font-medium">
            Confirm this source’s payroll schedule once
          </legend>
          <p className="text-xs text-slate-400">
            Suggested schedule: Sunday hours, Monday processing, Wednesday statement. Confirm or
            adjust below before saving.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Payroll issuer (if missing above)">
              <Input name="setupEmployer" defaultValue={preview.statement.employer ?? ''} />
            </FormField>
            <FormField label="Time zone">
              <Input name="setupTimezone" defaultValue="America/Chicago" required />
            </FormField>
            <FormField label="Regular forecast rate ($)">
              <Input
                name="setupRegular"
                defaultValue={regular === null ? '' : (regular / 100).toFixed(2)}
                required
                inputMode="decimal"
              />
            </FormField>
            <FormField label="Overtime forecast rate ($)">
              <Input
                name="setupOvertime"
                defaultValue={overtime === null ? '' : (overtime / 100).toFixed(2)}
                required
                inputMode="decimal"
              />
            </FormField>
            <FormField label="Workweek begins">
              <Select value={startDay} onChange={(e) => setStartDay(Number(e.target.value))}>
                {weekdays.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Usual bank deposit weekday">
              <Select value={depositDay} onChange={(e) => setDepositDay(Number(e.target.value))}>
                {weekdays.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            </FormField>
            {(
              [
                ['setupHoursDay', 'Hours reporting weekday', 0],
                ['setupProcessingDay', 'Processing weekday', 1],
                ['setupStatementDay', 'Statement weekday', 3],
              ] as const
            ).map(([name, label, value]) => (
              <FormField key={name} label={label}>
                <Select name={name} defaultValue={value}>
                  {weekdays.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </Select>
              </FormField>
            ))}
            <FormField label="Regular-hours threshold (reference only)">
              <Input name="setupThreshold" defaultValue="40" required inputMode="decimal" />
            </FormField>
          </div>
        </fieldset>
      )}
    </PayrollReviewForm>
  )
}
