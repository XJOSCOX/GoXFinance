import type { HouseholdOverview } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'

type Amounts = HouseholdOverview['payments']['billAmounts']
export function OverviewBillAmounts({ amounts }: { amounts: Amounts }) {
  const unknown = amounts.unconfirmedCount
  const metrics = [
    [
      'Budget estimates',
      amounts.periodCount > 0 && amounts.estimatedCount === 0 ? null : amounts.estimatedCents,
      'Estimates entered for these periods',
    ],
    [
      'Confirmed bills',
      unknown > 0 && amounts.confirmedCount === 0 ? null : amounts.confirmedCents,
      'Actual billed amounts only',
    ],
    ['Actually paid', amounts.paidCents, 'Completed payments on these bills'],
    [
      'Still owed',
      unknown > 0 && amounts.confirmedCount === 0 ? null : amounts.remainingCents,
      'Known remainder after payments and credits',
    ],
  ] as const
  return (
    <section aria-label="Bill amounts for the reporting month" className="mt-3">
      <p className="text-xs text-slate-500">
        Bills due in the reporting month. Payments may have cleared in a different month.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map(([label, amount, detail]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-slate-400">{label}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{formatMoney(amount)}</dd>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
          </div>
        ))}
      </dl>
      {unknown > 0 && (
        <p className="mt-2 text-xs text-amber-200/80">
          {unknown} bill {unknown === 1 ? 'total unconfirmed' : 'totals unconfirmed'}; confirmed and
          remaining totals are incomplete. Estimates do not count as owed or paid.
        </p>
      )}
      {(amounts.creditCents > 0 || amounts.overpaidCents > 0) && (
        <p className="mt-2 text-xs text-slate-400">
          Credits: {formatMoney(amounts.creditCents)} � Overpayments:{' '}
          {formatMoney(amounts.overpaidCents)}
        </p>
      )}
    </section>
  )
}
