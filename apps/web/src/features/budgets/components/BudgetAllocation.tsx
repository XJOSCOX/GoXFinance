import { sumCents } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'
import { readMoney } from '../../../lib/financial-entry'

function enteredBudgetCents(value: string) {
  const form = new FormData()
  form.set('amount', value)
  try {
    const amount = readMoney(form, 'amount', true)
    return amount !== null && amount >= 0 ? amount : null
  } catch {
    return null
  }
}
export function BudgetAllocation({ total, amounts }: { total: string; amounts: string[] }) {
  const monthly = enteredBudgetCents(total),
    parsed = amounts.map(enteredBudgetCents)
  let allocated: number | null = null
  try {
    if (parsed.every((v) => v !== null)) allocated = sumCents(parsed as number[])
  } catch {
    /* Invalid draft amounts are validated on save. */
  }
  const remaining = monthly !== null && allocated !== null ? monthly - allocated : null
  return (
    <div
      aria-live="polite"
      className="grid gap-2 rounded-xl border border-white/10 p-3 text-sm sm:grid-cols-3"
    >
      <div>
        <p className="text-xs text-slate-400">Monthly allocation</p>
        {formatMoney(monthly)}
      </div>
      <div>
        <p className="text-xs text-slate-400">Assigned to categories</p>
        {formatMoney(allocated)}
      </div>
      <div className={remaining !== null && remaining < 0 ? 'text-rose-300' : 'text-emerald-300'}>
        <p className="text-xs text-slate-400">
          {remaining !== null && remaining < 0 ? 'Over allocated' : 'Unallocated'}
        </p>
        {formatMoney(remaining === null ? null : Math.abs(remaining))}
      </div>
    </div>
  )
}
