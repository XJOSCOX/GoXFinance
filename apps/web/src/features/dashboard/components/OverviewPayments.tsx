import { useState } from 'react'
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
  if (group.items.length === 0) return <p className="py-2 text-sm text-slate-500">{empty}</p>
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm font-semibold tabular-nums">{formatMoney(group.totalCents)}</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">{detail}</p>
      <div className="mt-3 max-h-44 divide-y divide-white/10 overflow-y-auto">
        {group.items.length ? (
          group.items.map((payment) => (
            <div
              key={`${payment.source}:${payment.id}`}
              className="flex items-center justify-between gap-3 py-2 text-sm"
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
          <p className="py-2 text-sm text-slate-400">{empty}</p>
        )}
      </div>
    </div>
  )
}

export function OverviewPayments({
  payments,
  home,
}: {
  payments: HouseholdOverview['payments']
  home: string
}) {
  const [selected, setSelected] = useState<'completed' | 'pending' | 'scheduled'>('completed')
  const labels = { completed: 'Completed', pending: 'Pending', scheduled: 'Scheduled' }
  const details = {
    completed: 'Cleared bill and debt payments. Everyday purchases appear in spending.',
    pending: 'Awaiting clearance; excluded from cash paid.',
    scheduled: 'Planned payments; excluded from cash paid.',
  }
  return (
    <Card className="min-w-0 p-4">
      <section aria-label="Payments in reporting month" className="space-y-3">
        <div>
          <h2 className="font-semibold">Payment activity</h2>
          <p className="mt-1 text-xs text-slate-500">
            Selected month, by payment date. Linked bills and debts count once.
          </p>
        </div>
        <div
          className="grid grid-cols-3 gap-1 rounded-lg border border-white/[.07] bg-black/10 p-1"
          aria-label="Payment status"
        >
          {(['completed', 'pending', 'scheduled'] as const).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={selected === status}
              onClick={() => setSelected(status)}
              className={`min-w-0 rounded-md px-2 py-2 text-xs transition-colors focus-visible:outline focus-visible:outline-[#a9b8a9] ${selected === status ? 'bg-white/[.08] text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <span className="block">
                {labels[status]}{' '}
                <span className="text-slate-500">{payments[status].items.length}</span>
              </span>
              <span className="mt-1 block break-words tabular-nums">
                {formatMoney(payments[status].totalCents)}
              </span>
            </button>
          ))}
        </div>
        <PaymentList
          title={`${labels[selected]} payments`}
          group={payments[selected]}
          home={home}
          empty={`No ${selected} payments this month.`}
          detail={details[selected]}
        />
      </section>
    </Card>
  )
}
