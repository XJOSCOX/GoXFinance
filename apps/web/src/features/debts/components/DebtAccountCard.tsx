import { formatMoney as money } from '../../../lib/money'
import { MoreHorizontal } from 'lucide-react'
import {
  debtTypeLabels,
  paymentStatusLabels,
  type Debt,
  type FinancialCategory,
  type HouseholdMember,
} from '@goxfinance/shared'
import { Button } from '../../../components/ui'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { InfoHint } from '../../../components/ui/InfoHint'
import { categoryAppearance } from '../../categories/category-appearance'
import { Link } from 'react-router-dom'

export function DebtAccountCard({
  debt,
  category,
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
  category?: FinancialCategory
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
  const { Icon, color } = categoryAppearance(category?.name ?? 'Debt', category?.icon)
  return (
    <article
      aria-label={debt.creditorName}
      className="grid min-w-0 grid-cols-2 items-center gap-x-4 gap-y-2 border-b border-white/[.07] px-3 py-3 last:border-b-0 sm:px-4 lg:grid-cols-12 lg:gap-4"
    >
      <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-4">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{ color, backgroundColor: `${color}12` }}
          aria-hidden="true"
        >
          <Icon size={16} strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <h3>
            <button
              type="button"
              onClick={onView}
              aria-label={'View ' + debt.creditorName}
              className="text-left text-sm font-semibold text-[#eef0eb] hover:underline focus-visible:outline focus-visible:outline-[#a9b8a9] break-words"
            >
              {debt.creditorName}
            </button>
          </h3>
          <p className="text-[11px] text-slate-500">
            {category?.name ?? debtTypeLabels[debt.accountType]}
            <span className="lg:hidden">{people.length ? ` · ${people.join(' · ')}` : ''}</span>
          </p>
          <div className="mt-1 lg:hidden">
            <StatusBadge
              status={debt.paymentStatus}
              label={paymentStatusLabels[debt.paymentStatus]}
            />
            {debt.isArchived && <span className="ml-2 text-[10px] text-slate-500">Archived</span>}
          </div>
        </div>
      </div>
      <div className="hidden min-w-0 lg:col-span-2 lg:block">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500 lg:hidden">
          Responsible
        </p>
        <p className="break-words text-xs leading-5 text-slate-400">{people.join(' · ')}</p>
        {people.length > 1 && <p className="text-[10px] text-slate-500">Shared account</p>}
      </div>
      <div className="hidden flex-wrap items-center gap-1.5 lg:col-span-2 lg:flex">
        <StatusBadge status={debt.paymentStatus} label={paymentStatusLabels[debt.paymentStatus]} />
        {debt.isArchived && <span className="text-[10px] text-slate-500">Archived</span>}
      </div>
      <div className="flex min-w-0 items-center gap-1 lg:col-span-2 lg:justify-end">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500 lg:hidden">
          Balance
        </p>
        <p className="break-words text-base font-semibold tabular-nums tracking-tight">
          {money(debt.currentBalanceCents)}
        </p>
        <InfoHint
          label={'Balance details for ' + debt.creditorName}
          text={`${debt.confidence} balance. ${debt.accountNickname ? debt.accountNickname + '. ' : ''}${debtTypeLabels[debt.accountType]}. Responsible: ${people.join(' · ') || 'Not assigned'}.`}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1 lg:col-span-2">
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
              {canEdit && !requestMode && (
                <Link
                  className="block rounded-md px-3 py-2 text-sm hover:bg-white/5"
                  to={`/households/${debt.householdId}/debt-planning?settlementDebt=${debt.id}`}
                >
                  Record settlement
                </Link>
              )}
              <Link
                className="block rounded-md px-3 py-2 text-sm hover:bg-white/5"
                to={`/households/${debt.householdId}/goals`}
              >
                Plan payment / due-date goal
              </Link>
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
