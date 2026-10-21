import { useState } from 'react'
import { payrollCodes, bankDecimalCents, type PayrollProfileInput } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { Select, FormField } from '../../../components/ui/FormField'
import { PayrollTaxRuleFields } from './PayrollTaxRuleFields'
export function PayrollRules({
  initial,
  suggestions = [],
}: {
  initial: PayrollProfileInput['rules']
  suggestions?: PayrollProfileInput['rules']
}) {
  const [rules, setRules] = useState(initial)
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Deductions and withholding assumptions</legend>
      <p className="text-xs text-slate-400">
        Unknown amounts stay unknown. History uses reviewed paystubs from this source. A configured
        rate is your assumption, not an official tax-table calculation.
      </p>
      <input type="hidden" name="rules" value={JSON.stringify(rules)} />
      {suggestions
        .filter((s) => !rules.some((r) => r.code === s.code))
        .map((s) => (
          <div key={s.code} className="rounded-lg border border-sky-300/20 p-3 text-xs">
            <p>
              Observed pattern: {s.label} ·{' '}
              {s.mode === 'fixed'
                ? `fixed $${((s.fixedCents ?? 0) / 100).toFixed(2)}`
                : `${(s.rateBps ?? 0) / 100}% of gross less recurring additions`}
              . This is a suggestion, not a configured rule.
            </p>
            <Button type="button" size="small" onClick={() => setRules([...rules, s])}>
              Use suggested rule
            </Button>
          </div>
        ))}
      {rules.map((r, i) => (
        <div key={i} className="rounded-lg border border-white/10 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Component">
              <Select
                value={r.code}
                onChange={(e) =>
                  setRules(
                    rules.map((v, n) =>
                      n === i
                        ? {
                            ...v,
                            code: e.target.value as typeof r.code,
                            label: e.target.value.replaceAll('_', ' '),
                          }
                        : v,
                    ),
                  )
                }
              >
                {payrollCodes
                  .filter(
                    (c) =>
                      ![
                        'regular',
                        'overtime',
                        'pto',
                        'holiday',
                        'bonus',
                        'adjustment',
                        'other_earning',
                        'unknown',
                      ].includes(c),
                  )
                  .map((c) => (
                    <option key={c} value={c}>
                      {c.replaceAll('_', ' ')}
                    </option>
                  ))}
              </Select>
            </FormField>
            <FormField label="Prediction method">
              <Select
                value={r.mode}
                onChange={(e) =>
                  setRules(
                    rules.map((v, n) =>
                      n === i
                        ? {
                            ...v,
                            mode: e.target.value as typeof r.mode,
                            basis:
                              e.target.value === 'payroll_tax' &&
                              !['gross', 'explicit'].includes(v.basis)
                                ? 'gross'
                                : e.target.value === 'rate' && v.basis === 'explicit'
                                  ? 'gross'
                                  : v.basis,
                          }
                        : v,
                    ),
                  )
                }
              >
                {[
                  'unknown',
                  'fixed',
                  'rate',
                  'history',
                  ...(['social_security', 'medicare'].includes(r.code) ? ['payroll_tax'] : []),
                ].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Label">
              <Input
                value={r.label}
                maxLength={160}
                onChange={(e) =>
                  setRules(rules.map((v, n) => (n === i ? { ...v, label: e.target.value } : v)))
                }
              />
            </FormField>
            {r.mode === 'fixed' && (
              <FormField label="Fixed amount ($)">
                <Input
                  inputMode="decimal"
                  pattern="[0-9]+([.][0-9]{1,2})?"
                  defaultValue={r.fixedCents === null ? '' : (r.fixedCents / 100).toFixed(2)}
                  onChange={(e) => {
                    try {
                      const value = e.target.value ? bankDecimalCents(e.target.value) : null
                      setRules(rules.map((v, n) => (n === i ? { ...v, fixedCents: value } : v)))
                    } catch {
                      /* Invalid text stays in the input; server rejects incomplete rules. */
                    }
                  }}
                />
              </FormField>
            )}
            {r.mode === 'rate' && (
              <>
                <FormField label="Configured percentage">
                  <Input
                    inputMode="decimal"
                    pattern="[0-9]+([.][0-9]{1,2})?"
                    defaultValue={r.rateBps === null ? '' : r.rateBps / 100}
                    onChange={(e) => {
                      try {
                        const value = e.target.value ? bankDecimalCents(e.target.value) : null
                        setRules(rules.map((v, n) => (n === i ? { ...v, rateBps: value } : v)))
                      } catch {
                        /* Preserve invalid input for correction. */
                      }
                    }}
                  />
                </FormField>
                <FormField label="Taxable-base assumption">
                  <Select
                    value={r.basis}
                    onChange={(e) =>
                      setRules(
                        rules.map((v, n) =>
                          n === i ? { ...v, basis: e.target.value as typeof r.basis } : v,
                        ),
                      )
                    }
                  >
                    <option value="gross">Gross</option>
                    <option value="gross_less_pretax">
                      Gross less configured pretax benefits/retirement
                    </option>
                    <option value="gross_less_recurring">
                      Gross less approved recurring earnings additions
                    </option>
                  </Select>
                </FormField>
                <FormField label="Annual wage cap ($), optional">
                  <Input
                    inputMode="decimal"
                    pattern="[0-9]+([.][0-9]{1,2})?"
                    defaultValue={r.annualWageCapCents === null ? '' : r.annualWageCapCents / 100}
                    onChange={(e) => {
                      try {
                        setRules(
                          rules.map((v, n) =>
                            n === i
                              ? {
                                  ...v,
                                  annualWageCapCents: e.target.value
                                    ? bankDecimalCents(e.target.value)
                                    : null,
                                }
                              : v,
                          ),
                        )
                      } catch {
                        /* Keep text. */
                      }
                    }}
                  />
                </FormField>
                <FormField label="Prior taxable wages ($), explicit">
                  <Input
                    inputMode="decimal"
                    pattern="[0-9]+([.][0-9]{1,2})?"
                    defaultValue={
                      r.priorTaxableWagesCents === null ? '' : r.priorTaxableWagesCents / 100
                    }
                    onChange={(e) => {
                      try {
                        setRules(
                          rules.map((v, n) =>
                            n === i
                              ? {
                                  ...v,
                                  priorTaxableWagesCents: e.target.value
                                    ? bankDecimalCents(e.target.value)
                                    : null,
                                }
                              : v,
                          ),
                        )
                      } catch {
                        /* Keep text. */
                      }
                    }}
                  />
                </FormField>
              </>
            )}
          </div>
          {r.mode === 'payroll_tax' && (
            <PayrollTaxRuleFields
              rule={r}
              change={(values) =>
                setRules(rules.map((v, n) => (n === i ? { ...v, ...values } : v)))
              }
            />
          )}
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!r.applicable}
                onChange={(e) =>
                  setRules(
                    rules.map((v, n) => (n === i ? { ...v, applicable: !e.target.checked } : v)),
                  )
                }
              />
              I confirm this component does not apply
            </label>
            <Button
              size="small"
              type="button"
              onClick={() => setRules(rules.filter((_, n) => n !== i))}
            >
              Remove rule
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        size="small"
        disabled={rules.length >= 40}
        onClick={() =>
          setRules([
            ...rules,
            {
              code: 'other_deduction',
              label: 'Other deduction',
              applicable: true,
              mode: 'unknown',
              fixedCents: null,
              rateBps: null,
              basis: 'gross',
              annualWageCapCents: null,
              priorTaxableWagesCents: null,
            },
          ])
        }
      >
        Add deduction rule
      </Button>
    </fieldset>
  )
}
