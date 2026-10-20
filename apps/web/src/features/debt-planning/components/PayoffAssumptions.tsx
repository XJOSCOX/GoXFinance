import type { Dispatch, SetStateAction } from 'react'
import { payoffInputs, type Debt, type PayoffScenarioInput } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
import { formatMoney } from '../../../lib/money'
export function PayoffAssumptions({
  debts,
  input,
  setInput,
}: {
  debts: Debt[]
  input: PayoffScenarioInput
  setInput: Dispatch<SetStateAction<PayoffScenarioInput>>
}) {
  return (
    <details>
      <summary className="cursor-pointer text-sm text-slate-400">
        Explicit scenario assumptions & custom order
      </summary>
      <p className="my-2 text-xs text-slate-400">
        Optional overrides affect this scenario only. Blank fields use recorded values; missing APR
        is never assumed zero. Move debts to set custom priority.
      </p>
      {payoffInputs(debts, input)
        .sort(
          (a, b) => (input.order.indexOf(a.id) + 1 || 999) - (input.order.indexOf(b.id) + 1 || 999),
        )
        .map((d, i, all) => (
          <div key={d.id} className="my-3 rounded-lg border border-white/10 p-3">
            <div className="flex justify-between gap-2 text-sm">
              <strong>{d.name}</strong>
              <Button
                type="button"
                disabled={i === 0}
                onClick={() => {
                  const ids = all.map((d) => d.id)
                  ;[ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]
                  setInput({ ...input, order: ids })
                }}
              >
                Move up
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Balance {formatMoney(d.balanceCents)} · Minimum {formatMoney(d.minimumCents)} · APR{' '}
              {d.apr ?? 'Unknown'} · {d.status}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(['balance', 'min', 'apr'] as const).map((field) => (
                <FormField
                  key={field}
                  label={
                    field === 'apr'
                      ? 'Assumed APR (%)'
                      : field === 'min'
                        ? 'Assumed minimum ($)'
                        : 'Assumed balance ($)'
                  }
                >
                  <Input
                    name={d.id + ':' + field}
                    inputMode="decimal"
                    defaultValue={
                      field === 'apr'
                        ? input.assumptions.find((a) => a.debtId === d.id)?.apr
                        : ((field === 'min'
                              ? input.assumptions.find((a) => a.debtId === d.id)?.minimumCents
                              : input.assumptions.find((a) => a.debtId === d.id)?.balanceCents) ??
                              null) === null
                          ? ''
                          : (
                              ((field === 'min'
                                ? input.assumptions.find((a) => a.debtId === d.id)?.minimumCents
                                : input.assumptions.find((a) => a.debtId === d.id)?.balanceCents) ??
                                0) / 100
                            ).toFixed(2)
                    }
                    placeholder="Use recorded value"
                  />
                </FormField>
              ))}
            </div>
          </div>
        ))}
    </details>
  )
}
