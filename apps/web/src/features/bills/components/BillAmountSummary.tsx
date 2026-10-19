import type { BillPeriodView } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'

export function BillAmountSummary({ period }: { period: BillPeriodView }) {
  const amounts = [
    ['Budget estimate', period.estimatedAmountCents, 'For planning only'],
    ['Confirmed bill', period.amountCents, 'Amount billed this period'],
    ['Completed payments', period.paidCents, 'Cleared payments only'],
    [
      'Remaining owed',
      period.remainingCents,
      period.amountCents === null ? 'Confirm the bill total first' : 'After payments and credits',
    ],
  ] as const
  return (
    <section
      aria-label="Billing period amounts"
      className="space-y-3 rounded-xl border border-white/10 p-4"
    >
      <p className="text-xs text-slate-400">Due {period.dueDate}</p>
      <dl className="grid grid-cols-2 gap-4">
        {amounts.map(([label, value, detail]) => (
          <div key={label}>
            <dt className="text-xs text-slate-400">{label}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{formatMoney(value)}</dd>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
          </div>
        ))}
      </dl>
      {(period.creditCents > 0 || period.overpaidCents > 0) && (
        <p className="border-t border-white/10 pt-3 text-xs text-slate-400">
          Credits: {formatMoney(period.creditCents)} � Overpayment:{' '}
          {formatMoney(period.overpaidCents)}
        </p>
      )}
    </section>
  )
}
