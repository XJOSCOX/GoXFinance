import { Link } from 'react-router-dom'
import type { HouseholdOverview } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'

type PaymentGroup = HouseholdOverview['payments']['completed']
function PaymentList({
  title,
  group,
  home,
  empty,
  detail,
}: {
  title: string
  group: PaymentGroup
  home: string
  empty: string
  detail: string
}) {
  return (
    <Card className="min-w-0 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm font-semibold tabular-nums">{formatMoney(group.totalCents)}</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">{detail}</p>
      <div className="mt-3 max-h-80 divide-y divide-white/10 overflow-y-auto">
        {group.items.length ? (
          group.items.map((payment) => (
            <div
              key={`${payment.source}:${payment.id}`}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="min-w-0">
                <Link
                  className="block break-words hover:underline"
                  to={`/households/${home}/${payment.source === 'bill' ? 'bills' : 'debts'}`}
                >
                  {payment.name}
                </Link>
                <p className="mt-1 text-xs text-slate-400">
                  {payment.date} · {payment.source === 'bill' ? 'Bill' : 'Debt'}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">{formatMoney(payment.amountCents)}</span>
            </div>
          ))
        ) : (
          <p className="py-6 text-sm text-slate-400">{empty}</p>
        )}
      </div>
    </Card>
  )
}

export function OverviewPayments({
  payments,
  home,
}: {
  payments: HouseholdOverview['payments']
  home: string
}) {
  return (
    <section aria-label="Payments in reporting month" className="space-y-3">
      <div>
        <h2 className="font-semibold">Payments this reporting month</h2>
        <p className="mt-1 text-xs text-slate-400">
          By payment date. Linked bill and debt records count once; only completed payments have
          cleared.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <PaymentList
          title="Scheduled payments"
          group={payments.scheduled}
          home={home}
          empty="No scheduled payments this month."
          detail="Planned payments; not yet paid."
        />
        <PaymentList
          title="Pending payments"
          group={payments.pending}
          home={home}
          empty="No pending payments this month."
          detail="Awaiting clearance; not included in cash paid."
        />
        <PaymentList
          title="Completed payments"
          group={payments.completed}
          home={home}
          empty="No completed payments this month."
          detail="Cleared bill and debt payments. Everyday purchases appear separately."
        />
      </div>
    </section>
  )
}
