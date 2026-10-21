import { MoreHorizontal, ReceiptText } from 'lucide-react'
import { billRegisterAmounts, type BillView, type FinancialCategory } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { InfoHint } from '../../../components/ui/InfoHint'
import { toneStyles } from '../../../components/ui/semantic-tones'
import { billPeriodStatus } from '../bill-status'
import { useLocalToday } from '../../../lib/useLocalToday'

const columns = 'xl:grid-cols-[minmax(12rem,1.1fr)_minmax(0,3fr)_10rem]'
const shortLabels = ['Monthly', 'Confirmed', 'Paid', 'Past due', 'Next month']
const labels = [
  'Monthly Estimate',
  'Confirmed this month',
  'Paid this month',
  'Past due / still owed',
  'Next month',
]
type Props = {
  bills: BillView[]
  categories: FinancialCategory[]
  onView: (bill: BillView) => void
  onPay: (bill: BillView) => void
  onEdit: (bill: BillView) => void
  onArchive: (bill: BillView) => void
}
export function BillList({ bills, categories, ...actions }: Props) {
  const today = useLocalToday()
  return (
    <section aria-label="Bill register" className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-1">
          <h2 className="text-sm font-semibold">
            Your bills{' '}
            <span className="ml-2 text-xs font-normal text-slate-500">{bills.length}</span>
          </h2>
          <InfoHint
            label="Bill register amounts explained"
            text="Confirmed bills and completed payments refer to periods due this month. Past-due amounts remain separate. Next month includes earlier unpaid amounts if still unpaid. Select a bill name to see its full history."
          />
        </div>
      </div>
      {!bills.length ? (
        <Card className="p-10 text-center">
          <ReceiptText size={24} className="mx-auto mb-3 text-[#a9b8a9]" aria-hidden="true" />
          <p className="text-sm font-medium">No bills to show</p>
          <p className="mt-1 text-xs text-slate-400">Add a bill or adjust your filters.</p>
        </Card>
      ) : (
        <Card>
          <div
            aria-hidden="true"
            className={`hidden items-center gap-6 border-b border-white/[.07] bg-white/[.02] px-5 py-3 text-[11px] text-slate-500 xl:grid ${columns}`}
          >
            <span>Bill / due date</span>
            <div className="grid grid-cols-5 gap-3 text-right">
              {labels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-white/[.07]">
            {bills.map((bill) => (
              <BillListItem
                key={bill.id}
                bill={bill}
                today={today}
                category={
                  categories.find((category) => category.id === bill.categoryId)?.name ??
                  bill.category
                }
                {...actions}
              />
            ))}
          </div>
        </Card>
      )}
    </section>
  )
}
function BillListItem({
  bill,
  today,
  category,
  onView,
  onPay,
  onEdit,
  onArchive,
}: Omit<Props, 'bills' | 'categories'> & { bill: BillView; today: string; category: string }) {
  const periods = [...bill.periods].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const outstanding = periods.find(
    (period) => !['paid', 'credited', 'overpaid', 'cancelled'].includes(period.paymentStatus),
  )
  const period = outstanding ?? periods.at(-1)
  const register = billRegisterAmounts(bill, today)
  const amounts = [
    register.monthlyCents,
    register.confirmedCents,
    register.paidCents,
    register.pastDue.amountCents,
    register.nextMonth.totalCents,
  ]
  const hints = [
    bill.amountType === 'fixed'
      ? 'Saved fixed recurring amount, normalized to a month.'
      : 'Saved usage estimate for planning. The actual bill and payments are recorded separately.',
    !register.currentCount
      ? 'No billing period is due this month.'
      : register.confirmedCents === null
        ? 'The actual amount billed this month has not been entered.'
        : `Confirmed amounts for periods due this month.${register.unknownCurrentCount ? ' Some periods are not confirmed yet.' : ''}`,
    `Completed payments for this month's billing periods. Pending and scheduled payments are excluded.${register.remainingCents !== null ? ' Still to pay this month: ' + formatMoney(register.remainingCents) + '.' : ''}`,
    `Unpaid amounts from overdue billing periods, after completed payments and credits.${register.pastDue.estimated ? ' Includes estimated arrears; the actual bill is not entered yet.' : ''}${register.pastDue.unknownCount ? ' Some overdue amounts are unknown.' : ''}`,
    `${register.nextMonth.month}: ${formatMoney(register.nextMonth.due.amountCents)} due + ${formatMoney(register.nextMonth.carried.amountCents)} carried forward if earlier bills remain unpaid.${register.nextMonth.unknownCount ? ' Some amounts are unknown.' : ''}${register.nextMonth.due.estimated || register.nextMonth.carried.estimated ? ' Includes saved estimates.' : ' Projection only.'}`,
  ]
  const status = period ? billPeriodStatus(period, today) : null
  return (
    <article
      aria-label={bill.name}
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-4 py-3 transition-colors hover:bg-white/[.025] xl:gap-4 ${columns}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onView(bill)}
            className="min-w-0 break-words text-left text-sm font-semibold hover:text-[#b1beb0] focus-visible:outline focus-visible:outline-[#a9b8a9]"
          >
            {bill.name}
          </button>
          {bill.status !== 'active' ? (
            <StatusBadge status={bill.status} />
          ) : status ? (
            <StatusBadge status={status.label} tone={status.tone} />
          ) : (
            <StatusBadge status="No periods" />
          )}
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          <span>{period ? period.dueDate : 'No billing periods'}</span>
          <InfoHint
            label={`${bill.name}: bill details`}
            text={`${category} · ${bill.frequency ?? 'One-time'} · ${bill.amountType}${bill.autoPay ? ' · Auto-pay' : ''}${bill.linkedDebtId ? ' · Linked debt' : ''}. Click the bill name to view its periods and payment history.`}
          />
        </p>
      </div>
      <dl className="col-span-2 row-start-2 grid grid-cols-3 gap-x-2 gap-y-2 sm:grid-cols-5 xl:col-span-1 xl:row-start-auto xl:gap-3 xl:text-right">
        {labels.map((label, index) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] text-slate-500 xl:sr-only">
              <span className="sr-only">{label}</span>
              <span aria-hidden="true">{shortLabels[index]}</span>
            </dt>
            <dd
              className={`mt-1 flex items-center gap-1 tabular-nums xl:mt-0 xl:justify-end ${index === 3 ? `font-semibold ${register.pastDue.amountCents > 0 ? toneStyles.negative.text : 'text-slate-300'}` : index === 2 ? `text-sm ${toneStyles.positive.text}` : index === 0 ? `text-sm ${toneStyles.info.text}` : 'text-sm text-slate-300'}`}
            >
              {index === 1 && (!register.currentCount || register.confirmedCents === null) ? (
                <span aria-label={register.currentCount ? 'Not confirmed' : 'Not due this month'}>
                  —
                </span>
              ) : (
                formatMoney(amounts[index])
              )}
              <InfoHint label={`${bill.name}: ${label} details`} text={hints[index]} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 xl:col-start-auto xl:row-start-auto">
        {bill.canManage && bill.status !== 'cancelled' && (
          <Button size="small" onClick={() => onPay(bill)}>
            Record payment
          </Button>
        )}
        {bill.canManage && (
          <details
            name="bill-actions"
            className="relative"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.currentTarget.open = false
                event.currentTarget.querySelector('summary')?.focus()
              }
            }}
          >
            <summary
              aria-label={`Actions for ${bill.name}`}
              className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-slate-400 hover:bg-white/[.06] focus-visible:outline focus-visible:outline-[#a9b8a9] [&::-webkit-details-marker]:hidden"
            >
              <MoreHorizontal size={17} />
            </summary>
            <div className="absolute right-0 top-10 z-20 min-w-40 rounded-lg border border-white/10 bg-[#252825] p-1 shadow-xl">
              <Button
                size="small"
                variant="ghost"
                className="w-full justify-start"
                onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open')
                  onEdit(bill)
                }}
              >
                {bill.requiresApproval ? 'Request edit' : 'Edit bill'}
              </Button>
              {bill.status === 'active' && (
                <Button
                  size="small"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    onArchive(bill)
                  }}
                >
                  {bill.requiresApproval ? 'Request ' : ''}
                  {bill.kind === 'recurring' ? 'Deactivate' : 'Cancel bill'}
                </Button>
              )}
            </div>
          </details>
        )}
      </div>
    </article>
  )
}
