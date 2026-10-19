import type { TradingRule } from '@goxfinance/shared'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { FormField, Select } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { ruleFields } from '../lib/rule-fields'

export function TradingRuleFields({ rule }: { rule?: TradingRule }) {
  return (
    <section className="space-y-4 rounded-xl border border-white/10 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Rule label">
          <Input name="ruleLabel" defaultValue={rule?.label} required maxLength={120} />
        </FormField>
        <DateField name="ruleDate" label="Effective date" value={rule?.effectiveDate} required />
      </div>
      {['Payout rules', 'Evaluation and plan'].map((group) => (
        <details
          key={group}
          open={group === 'Payout rules'}
          className="border-t border-white/10 pt-3"
        >
          <summary className="cursor-pointer text-sm font-medium">{group}</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {ruleFields
              .filter((field) => field.group === group)
              .map(({ key, label, kind }) => {
                const value = rule?.[key],
                  name = 'rule:' + key
                if (kind === 'money')
                  return (
                    <AmountField
                      key={key}
                      name={name}
                      label={label}
                      value={value as number | null | undefined}
                    />
                  )
                return (
                  <FormField key={key} label={label}>
                    {kind === 'boolean' ? (
                      <Select name={name} defaultValue={value == null ? '' : value ? 'yes' : 'no'}>
                        <option value="">Unknown</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </Select>
                    ) : (
                      <Input
                        name={name}
                        type="number"
                        min="0"
                        max={kind === 'percent' ? '100' : undefined}
                        step={kind === 'percent' ? '0.01' : '1'}
                        defaultValue={
                          typeof value === 'number'
                            ? kind === 'percent'
                              ? value / 100
                              : value
                            : ''
                        }
                      />
                    )}
                  </FormField>
                )
              })}
          </div>
        </details>
      ))}
      <FormField label="Rule notes / source">
        <Input name="ruleNotes" defaultValue={rule?.notes ?? ''} maxLength={2000} />
      </FormField>
      <p className="text-xs text-slate-400">
        Advisory tracking settings. Fees are plan metadata, not recorded expenses. Saving a new
        snapshot preserves earlier rules and actual payments.
      </p>
    </section>
  )
}
