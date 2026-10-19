import { CalendarDays, Link2, MoreHorizontal, ReceiptText } from 'lucide-react'
import type { BillView, FinancialCategory } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'

const columns = 'xl:grid-cols-[minmax(12rem,1.2fr)_minmax(0,2fr)_13rem]'
const labels = ['Budget estimate', 'Confirmed bill', 'Paid', 'Still owed']
type Props = {
  bills: BillView[]
  categories: FinancialCategory[]
  onView: (bill: BillView) => void
  onPay: (bill: BillView) => void
  onEdit: (bill: BillView) => void
  onArchive: (bill: BillView) => void
}
export function BillList({ bills, categories, ...actions }: Props) {
  return (
    <section aria-label="Bill register" className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold">
          Your bills <span className="ml-2 text-xs font-normal text-slate-500">{bills.length}</span>
        </h2>
        <p className="text-xs text-slate-500">Amounts shown per billing period</p>
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
            <div className="grid grid-cols-4 gap-3 text-right">
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
  category,
  onView,
  onPay,
  onEdit,
  onArchive,
}: Omit<Props, 'bills' | 'categories'> & { bill: BillView; category: string }) {
  const periods = [...bill.periods].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const outstanding = periods.find(
    (period) => !['paid', 'credited', 'overpaid', 'cancelled'].includes(period.paymentStatus),
  )
  const period = outstanding ?? periods.at(-1)
  const amounts = period
    ? [
        period.budgetEstimateCents ?? period.estimatedAmountCents,
        period.amountCents,
        period.paidCents,
        period.remainingCents,
      ]
    : [null, null, null, null]
  const status =
    bill.status !== 'active'
      ? bill.status
      : period?.overdue
        ? 'Overdue'
        : (period?.paymentStatus.replaceAll('_', ' ') ?? 'No periods')
  const badge =
    period?.overdue && bill.status === 'active'
      ? 'border-amber-200/15 bg-amber-200/[.05] text-amber-200/80'
      : 'border-white/10 bg-white/[.03] text-slate-400'
  return (
    <article
      aria-label={bill.name}
      className={`grid items-center gap-4 p-4 transition-colors hover:bg-white/[.015] sm:p-5 xl:gap-6 ${columns}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onView(bill)}
            className="min-w-0 break-words text-left font-semibold hover:text-[#b1beb0] focus-visible:outline focus-visible:outline-[#a9b8a9]"
          >
            {bill.name}
          </button>
          <span className={`rounded-md border px-2 py-0.5 text-[10px] capitalize ${badge}`}>
            {status}
          </span>
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>{category}</span>
          <span aria-hidden="true">/</span>
          <span className="capitalize">{bill.frequency ?? 'One-time'}</span>
          <span className="capitalize">{bill.amountType}</span>
          {bill.autoPay && <span>Auto-pay</span>}
          {bill.linkedDebtId && (
            <span className="inline-flex items-center gap-1">
              <Link2 size={11} aria-hidden="true" />
              Linked debt
            </span>
          )}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
          <CalendarDays size={12} aria-hidden="true" />
          {period
            ? `${outstanding ? 'Due' : 'Latest period'} ${period.dueDate}`
            : 'No billing periods yet'}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg border border-white/[.06] bg-black/10 p-3 sm:grid-cols-4 xl:gap-3 xl:border-0 xl:bg-transparent xl:p-0 xl:text-right">
        {labels.map((label, index) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] text-slate-500 xl:sr-only">{label}</dt>
            <dd
              className={`mt-1 tabular-nums xl:mt-0 ${index === 3 ? 'font-semibold' : 'text-sm text-slate-300'}`}
            >
              {formatMoney(amounts[index])}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button size="small" variant="ghost" onClick={() => onView(bill)}>
          View
        </Button>
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
