import { useState, useRef } from 'react'
import {
  bankDecimalCents,
  payrollCurrentPeriod,
  payrollPeriodEnd,
  payrollFrequencyLabels,
  payrollMilestones,
  payrollGross,
  weeklyHoursSchema,
  type PayrollProfile,
  type PayrollWeek,
} from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
import { formatMoney } from '../../../lib/money'
export function PayrollHoursForm({
  profile,
  week,
  save,
  close,
}: {
  profile: PayrollProfile
  week?: PayrollWeek
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const frequency = week ? (week.payFrequency ?? 'weekly') : (profile.payFrequency ?? 'weekly'),
    split = week?.semiMonthlySplitDay ?? profile.semiMonthlySplitDay ?? 15,
    current = payrollCurrentPeriod(new Date(), { ...profile, payFrequency: frequency }),
    [start, setStart] = useState(week?.workweekStart ?? current?.start ?? ''),
    [estimate, setEstimate] = useState<number | null>(
      week?.forecasts.at(-1)?.result.grossCents ?? null,
    )
  const submission = useRef(crypto.randomUUID())
  const fields = ['regular', 'overtime', 'pto', 'holiday', 'otherPaid', 'unpaid'] as const
  const build = (f: FormData) =>
    weeklyHoursSchema.parse({
      sourceId: profile.sourceId,
      payFrequency: frequency,
      semiMonthlySplitDay: split,
      periodAnchor: week?.periodAnchor ?? profile.periodAnchor ?? null,
      workweekStart: f.get('start'),
      workweekEnd: f.get('end'),
      expectedPayDate: f.get('payDate'),
      ...Object.fromEntries(
        fields.map((k) => [
          k + 'Hundredths',
          String(f.get(k) || '') ? bankDecimalCents(String(f.get(k))) : k === 'unpaid' ? null : 0,
        ]),
      ),
      regularRateCents: bankDecimalCents(String(f.get('regularRate'))),
      overtimeRateCents: bankDecimalCents(String(f.get('overtimeRate'))),
      bonusCents: bankDecimalCents(String(f.get('bonus') || '0')),
      adjustmentCents: bankDecimalCents(String(f.get('adjustment') || '0')),
      otherEarningsCents: bankDecimalCents(String(f.get('otherEarnings') || '0')),
      notes: String(f.get('notes') || '') || null,
    })
  return (
    <FinancialEditor
      title={week ? 'Revise reported hours' : 'Report pay-period hours'}
      reasonLabel={week ? 'Reason for correction' : 'Hours report note'}
      record={week ?? { revision: 0 }}
      close={close}
      save={save}
      build={(f) => ({
        hours: build(f),
        submit: f.get('submitHours') === 'on',
        idempotencyKey: submission.current,
      })}
      submitLabel="Save hours and forecast"
    >
      <div
        onChange={(e) => {
          const form = e.currentTarget.closest('form')
          if (form)
            try {
              setEstimate(payrollGross(build(new FormData(form))).grossCents)
            } catch {
              setEstimate(null)
            }
        }}
        className="space-y-4"
      >
        <p className="text-xs text-slate-400">
          {payrollFrequencyLabels[frequency]} · Enter actual hours for this entire period. Overtime
          is entered explicitly; PTO is not treated as worked overtime.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            label="Pay period begins"
            name="start"
            value={start}
            required
            onChange={setStart}
          />
          <DateField
            key={start}
            label="Pay period ends"
            name="end"
            value={
              week?.workweekEnd ??
              payrollPeriodEnd(start, frequency, split, week?.periodAnchor ?? profile.periodAnchor)
            }
            required
          />
          <DateField
            key={start + 'pay'}
            label="Expected pay date (can be changed)"
            name="payDate"
            value={
              week?.expectedPayDate ??
              (payrollPeriodEnd(start, frequency, split, week?.periodAnchor ?? profile.periodAnchor)
                ? payrollMilestones(
                    payrollPeriodEnd(
                      start,
                      frequency,
                      split,
                      week?.periodAnchor ?? profile.periodAnchor,
                    )!,
                    { ...profile, payFrequency: frequency },
                  ).deposit
                : null)
            }
            required
          />
          {fields.map((k) => (
            <FormField
              key={k}
              label={
                k === 'otherPaid' ? 'Other paid hours' : k[0].toUpperCase() + k.slice(1) + ' hours'
              }
            >
              <Input
                name={k}
                inputMode="decimal"
                defaultValue={
                  week?.[(k + 'Hundredths') as keyof PayrollWeek] === undefined
                    ? ''
                    : Number(week[(k + 'Hundredths') as keyof PayrollWeek] ?? 0) / 100
                }
                required={k === 'regular' || k === 'overtime'}
                placeholder="Enter actual hours"
              />
            </FormField>
          ))}
          <AmountField
            label="Regular rate ($)"
            name="regularRate"
            value={week?.regularRateCents ?? profile.regularRateCents}
            required
          />
          <AmountField
            label="Overtime rate ($)"
            name="overtimeRate"
            value={week?.overtimeRateCents ?? profile.overtimeRateCents}
            required
          />
        </div>
        <details>
          <summary className="cursor-pointer text-sm">Other earnings and notes</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <AmountField label="Bonus ($)" name="bonus" value={week?.bonusCents} />
            <AmountField
              label="Signed adjustment ($)"
              name="adjustment"
              value={week?.adjustmentCents}
            />
            <AmountField
              label="Other earnings ($)"
              name="otherEarnings"
              value={week?.otherEarningsCents}
            />
            <FormField label="Notes">
              <Input name="notes" maxLength={2000} defaultValue={week?.notes ?? ''} />
            </FormField>
          </div>
        </details>
        <p className="text-lg font-semibold">Estimated gross {formatMoney(estimate)}</p>
        <p className="text-xs text-slate-400">
          PTO/holiday hours are paid separately from worked hours and do not automatically earn
          overtime. No funds are recorded as received.
        </p>
        <label className="flex gap-2 text-sm">
          <input
            name="submitHours"
            type="checkbox"
            defaultChecked={week?.stage === 'hours_submitted'}
          />
          Hours are submitted (leave unchecked to keep a draft)
        </label>
      </div>
    </FinancialEditor>
  )
}
