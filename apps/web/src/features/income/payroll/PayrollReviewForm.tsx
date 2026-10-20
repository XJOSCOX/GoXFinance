import { useState } from 'react'
import {
  bankDecimalCents,
  payrollStatementSchema,
  payrollReconciliation,
  type PayrollStatement,
  type PayrollWeek,
  type PayrollLine,
} from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { Button, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { formatMoney } from '../../../lib/money'
import { PayrollLineFields } from './PayrollLineFields'
export function PayrollReviewForm({
  week,
  initial,
  warnings,
  save,
  close,
}: {
  week: PayrollWeek
  initial: PayrollStatement
  warnings: string[]
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const [rows, setRows] = useState(
      initial.lines.map((line) => ({ key: crypto.randomUUID(), line })),
    ),
    [issues, setIssues] = useState(payrollReconciliation(initial))
  const build = (f: FormData) => {
    const amount = (key: string) =>
      String(f.get(key) || '').trim() ? bankDecimalCents(String(f.get(key))) : null
    return payrollStatementSchema.parse({
      deductionSign: f.get('deductionSign'),
      employer: String(f.get('employer') || '') || null,
      assignment: String(f.get('assignment') || '') || null,
      periodStart: f.get('periodStart') || null,
      periodEnd: f.get('periodEnd') || null,
      payDate: f.get('payDate') || null,
      grossCents: amount('gross'),
      deductionsCents: amount('deductions'),
      netCents: amount('net'),
      acknowledgement: String(f.get('acknowledgement') || '') || null,
      lines: rows.map(({ key }) => {
        const prefix = 'line:' + key + ':'
        return {
          label: f.get(prefix + 'label'),
          side: f.get(prefix + 'side'),
          code: f.get(prefix + 'code'),
          treatment: f.get(prefix + 'treatment'),
          ...Object.fromEntries(
            ['currentCents', 'ytdCents', 'rateCents', 'hoursHundredths'].map((k) => [
              k,
              amount(prefix + k),
            ]),
          ),
          worked:
            f.get(prefix + 'worked') === 'unknown' ? null : f.get(prefix + 'worked') === 'true',
          confidence: f.get(prefix + 'confidence'),
        }
      }),
    })
  }
  return (
    <FinancialEditor
      title={week.statement ? 'Correct reviewed paystub' : 'Review extracted paystub'}
      reasonLabel="Review / correction note"
      record={week}
      close={close}
      save={save}
      build={build}
      submitLabel="Save reviewed statement (not received cash)"
    >
      <div
        className="space-y-4"
        onChange={(e) => {
          const form = e.currentTarget.closest('form')
          if (form)
            try {
              setIssues(payrollReconciliation(build(new FormData(form))))
            } catch {
              setIssues(['Correct invalid amounts or dates before saving.'])
            }
        }}
      >
        <div className="rounded-lg bg-white/5 p-3 text-sm">
          Original statement totals: gross {formatMoney(initial.grossCents)} · employee deductions{' '}
          {formatMoney(initial.deductionsCents)} · net {formatMoney(initial.netCents)}
          <p className="mt-2 text-xs text-slate-400">
            Amounts are documented only. Confirm the actual deposit separately. YTD values are
            cumulative observations.
          </p>
        </div>
        {warnings.map((v, i) => (
          <p key={i} className="text-xs text-amber-200">
            {v}
          </p>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Employer">
            <Input name="employer" maxLength={160} defaultValue={initial.employer ?? ''} />
          </FormField>
          <FormField label="Assignment / client">
            <Input name="assignment" maxLength={160} defaultValue={initial.assignment ?? ''} />
          </FormField>
          <DateField
            label="Pay period begins"
            name="periodStart"
            value={initial.periodStart}
            required
          />
          <DateField label="Pay period ends" name="periodEnd" value={initial.periodEnd} required />
          <DateField label="Statement pay date" name="payDate" value={initial.payDate} required />
          <AmountField
            label="Statement gross ($)"
            name="gross"
            value={initial.grossCents}
            required
          />
          <AmountField
            label="Total employee deductions ($)"
            name="deductions"
            value={initial.deductionsCents}
            required
          />
          <AmountField
            label="Documented net pay ($)"
            name="net"
            value={initial.netCents}
            required
          />
        </div>
        <FormField label="How deductions are printed on this statement">
          <Select name="deductionSign" defaultValue={initial.deductionSign ?? 'positive'}>
            <option value="positive">Positive deduction amounts</option>
            <option value="negative">Negative amounts that reduce pay</option>
          </Select>
        </FormField>
        <p className="text-xs text-slate-400">
          Extracted worked hours:{' '}
          {initial.lines.some((l) => l.worked === true && l.hoursHundredths !== null)
            ? initial.lines
                .filter((l) => l.worked === true)
                .reduce((n, l) => n + (l.hoursHundredths ?? 0), 0) / 100
            : 'Unknown'}{' '}
          · paid hours:{' '}
          {initial.lines.some((l) => l.hoursHundredths !== null)
            ? initial.lines
                .filter((l) => l.side === 'earnings')
                .reduce((n, l) => n + (l.hoursHundredths ?? 0), 0) / 100
            : 'Unknown'}
          . Verify line-level classifications below.
        </p>
        <h3 className="text-sm font-semibold">Exact payroll components</h3>
        {rows.map(({ key, line }) => (
          <PayrollLineFields
            key={key}
            line={line}
            prefix={'line:' + key + ':'}
            remove={() => setRows(rows.filter((r) => r.key !== key))}
          />
        ))}
        <Button
          type="button"
          disabled={rows.length >= 150}
          onClick={() =>
            setRows([
              ...rows,
              {
                key: crypto.randomUUID(),
                line: {
                  label: 'Other payroll component',
                  side: 'deduction',
                  code: 'unknown',
                  treatment: 'unknown',
                  currentCents: null,
                  ytdCents: null,
                  rateCents: null,
                  hoursHundredths: null,
                  worked: null,
                  confidence: 'manual',
                } satisfies PayrollLine,
              },
            ])
          }
        >
          Add component
        </Button>
        {issues.length > 0 && (
          <div
            role="status"
            className="space-y-1 rounded-lg border border-amber-300/20 p-3 text-xs text-amber-200"
          >
            {issues.map((v, i) => (
              <p key={i}>{v}</p>
            ))}
          </div>
        )}
        <FormField label="Discrepancy acknowledgement (required if issues remain)">
          <Input
            name="acknowledgement"
            defaultValue={initial.acknowledgement ?? ''}
            maxLength={2000}
            placeholder="Explain the remaining discrepancy; missing tax amounts stay unknown"
          />
        </FormField>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" required />I verified current amounts, YTD columns, dates and
          classifications against my statement.
        </label>
      </div>
    </FinancialEditor>
  )
}
