import { useState } from 'react'
import {
  localBillDate,
  settlementProgress,
  type PlanningData,
  type SettlementOffer,
} from '@goxfinance/shared'
import { Button, Card, Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
import { formatMoney } from '../../../lib/money'
import { readMoney } from '../../../lib/financial-entry'
export function SettlementList({
  data,
  edit,
  audit,
}: {
  data: PlanningData
  edit: (offer?: SettlementOffer) => void
  audit: (id: string) => void
}) {
  const [budget, setBudget] = useState('')
  let funds: number | null = null
  try {
    const f = new FormData()
    f.set('funds', budget)
    funds = readMoney(f, 'funds')
  } catch {
    /* Incomplete input is not a cash assumption. */
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FormField label="Available settlement funds this month ($)">
          <Input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="decimal"
            placeholder="Enter explicit planning amount"
          />
        </FormField>
        {data.editableDebtIds.length > 0 && (
          <Button variant="primary" onClick={() => edit()}>
            Add settlement offer
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Protect essentials and current minimums first. Hypothetical trading profits are not
        available funds. This budget is an unsaved planning assumption.
      </p>
      {!data.offers.length && (
        <Card className="p-6 text-sm text-slate-400">No settlement offers recorded.</Card>
      )}
      {data.offers.map((o) => {
        const p = settlementProgress(o, data.payments, localBillDate()),
          monthly = p.schedule
            .filter((s) => s.dueDate.startsWith(localBillDate().slice(0, 7)))
            .reduce((n, s) => n + s.remainingCents, 0)
        return (
          <Card key={o.id} className="p-4">
            <header className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="font-semibold">{o.creditor}</h2>
                <p className="text-xs text-slate-400">
                  {o.status} · {o.kind} ·{' '}
                  {o.expirationDate ? `expires ${o.expirationDate}` : 'No expiration recorded'} ·{' '}
                  {o.writtenConfirmed
                    ? 'Written agreement received'
                    : 'No written agreement confirmed'}
                </p>
              </div>
              <div className="flex gap-2">
                {o.canManage && (
                  <Button size="small" onClick={() => edit(o)}>
                    Edit offer
                  </Button>
                )}
                <Button size="small" onClick={() => audit(o.id)}>
                  Audit history
                </Button>
              </div>
            </header>
            <dl className="my-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              {[
                ['Obligation', o.amountCents],
                ['Savings', p.savingsCents],
                ['Completed payments', p.paidCents],
                ['Still owed', p.remainingCents],
              ].map(([label, amount]) => (
                <div key={label}>
                  <dt className="text-slate-400">{label}</dt>
                  <dd className="mt-1 font-semibold">{formatMoney(amount as number | null)}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-slate-400">
              Discount {p.discountPercent === null ? 'Unknown' : p.discountPercent.toFixed(2) + '%'}{' '}
              · Initial {formatMoney(p.initialCents)} · {o.schedule.length} payments · Planned
              completion {p.completionDate}
            </p>
            {p.overpaidCents > 0 && (
              <p className="mt-2 text-sm text-amber-200">
                Overpayment {formatMoney(p.overpaidCents)} — reconcile with creditor.
              </p>
            )}
            {funds !== null && monthly > funds && (
              <p role="alert" className="mt-2 text-sm text-rose-300">
                Unaffordable this month: {formatMoney(monthly - funds)} shortfall.
              </p>
            )}
            {o.status === 'completed' && p.remainingCents > 0 && (
              <p role="alert" className="text-rose-300">
                Payment correction has reopened the obligation; review completion verification.
              </p>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-slate-400">
                Payment schedule ({p.schedule.length})
              </summary>
              <ul className="mt-2 divide-y divide-white/10 text-xs">
                {p.schedule.map((s) => (
                  <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {s.dueDate} · due {formatMoney(s.amountCents)}
                    </span>
                    <span className={s.missed ? 'text-amber-200' : 'text-slate-400'}>
                      Paid {formatMoney(s.paidCents)} · left {formatMoney(s.remainingCents)}
                      {s.missed ? ' · Missed / incomplete' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        )
      })}
    </div>
  )
}
