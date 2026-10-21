import { useState } from 'react'
import {
  payrollProfileSchema,
  bankDecimalCents,
  type IncomeSource,
  type PayrollProfile,
  type PayrollProfileInput,
} from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField } from '../../../components/financial/EntryFields'
import { Button, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { PayrollRules } from './PayrollRules'
import { PayrollScheduleFields } from './PayrollScheduleFields'
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export function PayrollProfileForm({
  source,
  profile,
  save,
  close,
}: {
  source: IncomeSource
  profile?: PayrollProfile
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const [preset, setPreset] = useState(false),
    base = profile ?? {
      sourceId: source.id,
      employer: '',
      assignment: null,
      payFrequency: source.frequency,
      regularRateCents: source.hourlyRateCents,
      overtimeRateCents: null,
      regularThresholdHundredths: 4000,
      timezone: 'America/Chicago',
      workweekStartDay: 1,
      hoursDay: 0,
      processingDay: 1,
      statementDay: 3,
      depositDay: source.payday ?? 4,
      rules: ['federal', 'social_security', 'medicare', 'state', 'local'].map((code) => ({
        code,
        label: code.replaceAll('_', ' '),
        applicable: true,
        mode: 'unknown',
        fixedCents: null,
        rateBps: null,
        basis: 'gross',
        annualWageCapCents: null,
        priorTaxableWagesCents: null,
      })) as PayrollProfileInput['rules'],
    },
    initial = preset
      ? {
          ...base,
          employer: 'HireArt Inc.',
          assignment: 'Avride',
          regularRateCents: 2500,
          overtimeRateCents: 3750,
        }
      : base
  return (
    <FinancialEditor
      key={String(preset)}
      title={`Payroll settings · ${source.name}`}
      reasonLabel={profile ? 'Reason for correction' : 'Setup note'}
      record={profile ?? { revision: 0 }}
      close={close}
      save={save}
      submitLabel="Confirm payroll settings"
      build={(f) =>
        payrollProfileSchema.parse({
          sourceId: source.id,
          employer: f.get('employer'),
          assignment: String(f.get('assignment') || '') || null,
          regularRateCents: f.get('regularRate')
            ? bankDecimalCents(String(f.get('regularRate')))
            : null,
          overtimeRateCents: f.get('overtimeRate')
            ? bankDecimalCents(String(f.get('overtimeRate')))
            : null,
          payFrequency: f.get('payFrequency'),
          periodAnchor: f.get('periodAnchor') || null,
          semiMonthlySplitDay: Number(f.get('semiMonthlySplitDay')),
          depositOffsetDays: f.get('depositOffsetDays') ? Number(f.get('depositOffsetDays')) : null,
          regularThresholdHundredths: f.get('threshold')
            ? bankDecimalCents(String(f.get('threshold')))
            : null,
          milestonesConfigured: true,
          timezone: f.get('timezone'),
          ...Object.fromEntries(
            ['workweekStartDay', 'hoursDay', 'processingDay', 'statementDay', 'depositDay'].map(
              (k) => [k, Number(f.get(k))],
            ),
          ),
          rules: JSON.parse(String(f.get('rules'))),
        })
      }
    >
      {!profile && (
        <Button type="button" onClick={() => setPreset(!preset)}>
          Use HireArt / Avride settings for review
        </Button>
      )}
      <PayrollScheduleFields
        initial={{ ...initial, payFrequency: initial.payFrequency ?? source.frequency }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Payroll employer">
          <Input name="employer" required maxLength={160} defaultValue={initial.employer} />
        </FormField>
        <FormField label="Assignment / client">
          <Input
            placeholder="Client or work assignment (optional)"
            name="assignment"
            maxLength={160}
            defaultValue={initial.assignment ?? ''}
          />
        </FormField>
        <AmountField
          label="Regular hourly rate ($)"
          name="regularRate"
          value={initial.regularRateCents}
        />
        <AmountField
          label="Overtime hourly rate ($)"
          name="overtimeRate"
          value={initial.overtimeRateCents}
        />
        <FormField label="Regular-hours threshold (reference, not assumed hours)">
          <Input
            name="threshold"
            inputMode="decimal"
            defaultValue={
              initial.regularThresholdHundredths === null
                ? ''
                : initial.regularThresholdHundredths / 100
            }
            required
          />
        </FormField>
        <FormField label="Workweek time zone">
          <Input name="timezone" defaultValue={initial.timezone} required />
        </FormField>
        {(
          ['workweekStartDay', 'hoursDay', 'processingDay', 'statementDay', 'depositDay'] as const
        ).map((k) => (
          <FormField
            key={k}
            label={
              {
                workweekStartDay: 'Workweek begins at midnight',
                hoursDay: 'Hours reporting',
                processingDay: 'Payroll processing',
                statementDay: 'Expected paystub',
                depositDay: 'Usual deposit',
              }[k]
            }
          >
            <Select name={k} defaultValue={initial[k]}>
              {days.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </FormField>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        The workweek ends just before midnight on the preceding weekday. Milestones are
        expectations; actual dates and holidays can differ.
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Deduction forecast rules (advanced)
        </summary>
        <div className="mt-4">
          <PayrollRules initial={initial.rules} />
        </div>
      </details>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" required />I reviewed these source-specific rates, dates and
        deduction assumptions.
      </label>
    </FinancialEditor>
  )
}
