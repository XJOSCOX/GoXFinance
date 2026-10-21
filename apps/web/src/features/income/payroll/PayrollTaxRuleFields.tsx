import type { PayrollProfileInput } from '@goxfinance/shared'
import { bankDecimalCents } from '@goxfinance/shared'
import { Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
type Rule = PayrollProfileInput['rules'][number]
export function PayrollTaxRuleFields({
  rule: r,
  change,
}: {
  rule: Rule
  change: (values: Partial<Rule>) => void
}) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <p className="text-xs text-slate-400 sm:col-span-2">
        Employee Social Security/Medicare rules support 2026 only. Enter this employer's prior
        taxable wages for the exact payday; missing or stale inputs leave the result unknown. Gross
        is a taxable-wage assumption only if you explicitly choose it.
      </p>
      <FormField label="Tax year">
        <Select
          value={r.taxYear ?? ''}
          onChange={(e) => change({ taxYear: Number(e.target.value) })}
        >
          <option value="">Choose tax year</option>
          <option value="2026">2026</option>
        </Select>
      </FormField>
      <FormField label="Prior wages apply to payday">
        <Input
          type="date"
          value={r.priorWagesForPayDate ?? ''}
          onChange={(e) => change({ priorWagesForPayDate: e.target.value })}
        />
      </FormField>
      <FormField label="This employer's prior taxable wages ($)">
        <Input
          inputMode="decimal"
          defaultValue={r.priorTaxableWagesCents === null ? '' : r.priorTaxableWagesCents / 100}
          onChange={(e) => {
            try {
              change({
                priorTaxableWagesCents: e.target.value ? bankDecimalCents(e.target.value) : null,
              })
            } catch {
              /* Keep invalid text for correction. */
            }
          }}
        />
      </FormField>
      <FormField label="Payroll tax wage basis">
        <Select
          value={r.basis}
          onChange={(e) => change({ basis: e.target.value as Rule['basis'] })}
        >
          <option value="gross">I confirm gross is taxable wages</option>
          <option value="explicit">Explicit taxable wages</option>
        </Select>
      </FormField>
      {r.basis === 'explicit' && (
        <FormField label="Taxable wages for this paycheck ($)">
          <Input
            inputMode="decimal"
            defaultValue={r.taxableWagesCents == null ? '' : r.taxableWagesCents / 100}
            onChange={(e) => {
              try {
                change({
                  taxableWagesCents: e.target.value ? bankDecimalCents(e.target.value) : null,
                })
              } catch {
                /* Keep invalid text for correction. */
              }
            }}
          />
        </FormField>
      )}
    </div>
  )
}
