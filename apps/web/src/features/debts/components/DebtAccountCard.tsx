import { CreditCard, MoreHorizontal } from 'lucide-react'
import {
  debtTypeLabels,
  paymentStatusLabels,
  type Debt,
  type HouseholdMember,
} from '@goxfinance/shared'
import { Button } from '../../../components/ui'

const money = (cents: number | null) =>
  cents == null
    ? 'Unknown'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export function DebtAccountCard({
  debt,
  members,
  canEdit,
  canArchive,
  onView,
  onEdit,
  onArchive,
  onRecordPayment,
  requestMode = false,
}: {
  debt: Debt
  members: HouseholdMember[]
  canEdit: boolean
  canArchive: boolean
  requestMode?: boolean
  onView: () => void
  onEdit: () => void
  onArchive: () => void
  onRecordPayment?: () => void
}) {
  const people = debt.memberAssignments.map(
    (item) => members.find((member) => member.id === item.memberId)?.fullName ?? 'Member',
  )
  return (
    <article
      aria-label={debt.creditorName}
      className="grid min-w-0 grid-cols-2 items-center gap-x-4 gap-y-4 border-b border-white/[.07] px-4 py-5 last:border-b-0 sm:px-6 lg:grid-cols-12 lg:gap-4"
    >
      <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#aab9a9]/[.12] bg-[#aab9a9]/[.05] text-[#b2c1b1]">
          <CreditCard size={18} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold text-[#eef0eb]">{debt.creditorName}</h3>
          <p className="mt-1 break-words text-xs text-slate-500">
            {debt.accountNickname || debtTypeLabels[debt.accountType]}
          </p>
        </div>
      </div>
      <div className="min-w-0 lg:col-span-2">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500 lg:hidden">
          Responsible
        </p>
        <p className="break-words text-xs leading-5 text-slate-400">{people.join(' · ')}</p>
        {people.length > 1 && <p className="text-[10px] text-slate-500">Shared account</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 lg:col-span-2">
        <span className="rounded-md border border-white/[.07] bg-white/[.035] px-2 py-1 text-[11px] text-slate-300">
          {paymentStatusLabels[debt.paymentStatus]}
        </span>
        {debt.isArchived && <span className="text-[10px] text-slate-500">Archived</span>}
      </div>
      <div className="min-w-0 lg:col-span-2 lg:text-right">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500 lg:hidden">
          Balance
        </p>
        <p className="break-words text-lg font-semibold tabular-nums tracking-tight">
          {money(debt.currentBalanceCents)}
        </p>
        <p className="mt-1 text-[10px] capitalize text-slate-500">{debt.confidence}</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1 lg:col-span-2">
        <Button size="small" onClick={onView} aria-label={'View ' + debt.creditorName}>
          View
        </Button>
        {onRecordPayment && (
          <Button size="small" onClick={onRecordPayment}>
            Record payment
          </Button>
        )}
        {(canEdit || canArchive) && (
          <details
            name="debt-account-actions"
            className="relative"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.currentTarget.open = false
                event.currentTarget.querySelector('summary')?.focus()
              }
            }}
          >
            <summary
              aria-label={'Actions for ' + debt.creditorName}
              className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-slate-400 hover:bg-white/[.06] focus-visible:outline focus-visible:outline-[#a9b8a9] [&::-webkit-details-marker]:hidden"
            >
              <MoreHorizontal size={17} />
            </summary>
            <div className="absolute right-0 top-10 z-20 min-w-40 rounded-lg border border-white/10 bg-[#252825] p-1 shadow-xl">
              {canEdit && (
                <Button
                  size="small"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    onEdit()
                  }}
                >
                  {requestMode ? 'Request edit' : 'Edit'}
                </Button>
              )}
              {canArchive && (
                <Button
                  size="small"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    onArchive()
                  }}
                >
                  {requestMode
                    ? debt.isArchived
                      ? 'Request restore'
                      : 'Request archive'
                    : debt.isArchived
                      ? 'Restore'
                      : 'Archive'}
                </Button>
              )}
            </div>
          </details>
        )}
      </div>
    </article>
  )
}
