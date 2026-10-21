import { useState } from 'react'
import type { PayrollProfileInput } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'
export function PayrollRecurringEarnings({
  initial,
  suggestions,
}: {
  initial: PayrollProfileInput['recurringEarnings']
  suggestions: NonNullable<PayrollProfileInput['recurringEarnings']>
}) {
  const [rules, setRules] = useState(initial ?? [])
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Recurring earnings additions</legend>
      <input type="hidden" name="recurringEarnings" value={JSON.stringify(rules)} />
      <p className="text-xs text-slate-400">
        Suggestions require three consistent ordinary-pay statements from this employer. Confirm
        only additions outside hourly earnings; disable any component already included in your rate
        or additional earnings.
      </p>
      {rules.map((r, i) => (
        <label key={r.label} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={r.enabled}
            onChange={(e) =>
              setRules(rules.map((v, n) => (n === i ? { ...v, enabled: e.target.checked } : v)))
            }
          />
          <span>
            {r.label} · {formatMoney(r.amountCents)} per paycheck
          </span>
        </label>
      ))}
      {suggestions
        .filter((s) => !rules.some((r) => r.label === s.label))
        .map((s) => (
          <div key={s.label} className="rounded-lg border border-white/10 p-3 text-sm">
            <p>
              {s.label} · {formatMoney(s.amountCents)}
            </p>
            <button
              type="button"
              className="mt-2 text-sky-200 underline"
              onClick={() => setRules([...rules, s])}
            >
              Approve addition for this employer
            </button>
          </div>
        ))}
      {!rules.length && !suggestions.length && (
        <p className="text-xs text-slate-500">No consistent additions suggested yet.</p>
      )}
    </fieldset>
  )
}
