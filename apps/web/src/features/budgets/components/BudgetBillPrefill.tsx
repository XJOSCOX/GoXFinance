import { useState } from 'react'
import type { BudgetBillDraft } from '@goxfinance/shared'
import { Button } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'

export function BudgetBillPrefill({
  draft,
  apply,
}: {
  draft?: BudgetBillDraft
  apply: (draft: BudgetBillDraft) => void
}) {
  const [preview, setPreview] = useState(false)
  if (!draft) return null
  return (
    <section className="space-y-3 rounded-xl border border-white/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Start from existing bills</h3>
          <p className="text-xs text-slate-400">
            Review amounts due this month before using them as category allocations.
          </p>
        </div>
        <Button type="button" onClick={() => setPreview(!preview)}>
          {preview ? 'Hide bill preview' : 'Preview saved bills'}
        </Button>
      </div>
      {preview && (
        <>
          <ul className="divide-y divide-white/10 text-sm">
            {draft.rows.map((row) => (
              <li key={row.billId + row.dueDate} className="flex justify-between gap-3 py-2">
                <div>
                  {row.name}
                  <p className="text-xs text-slate-400">
                    {row.dueDate} · {row.basis}
                  </p>
                </div>
                <span className="shrink-0">{formatMoney(row.amountCents)}</span>
              </li>
            ))}
          </ul>
          {!draft.rows.length && (
            <p className="text-sm text-slate-400">No active bills due in this month.</p>
          )}
          <p className="text-sm">
            Suggested category allocation: <strong>{formatMoney(draft.totalCents)}</strong>
          </p>
          <p className="text-xs text-slate-400">
            Applying replaces the category amounts in this draft. Your monthly allocation stays
            editable. No bills, payments or actual spending are changed. Review and adjust before
            Save budget.
          </p>
          <Button
            type="button"
            disabled={!draft.limits.length}
            onClick={() => {
              apply(draft)
              setPreview(false)
            }}
          >
            Use bill amounts in draft
          </Button>
        </>
      )}
    </section>
  )
}
