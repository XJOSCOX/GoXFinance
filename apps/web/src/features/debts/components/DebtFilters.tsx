import { Search, SlidersHorizontal } from 'lucide-react'
import { debtTypeLabels, paymentStatusLabels, type HouseholdMember } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'

import { emptyDebtFilters, type DebtFiltersValue } from '../lib/debt-filters'

export function DebtFilters({ value, onChange, members, showArchived, onArchivedChange, archivedCount, count }: {
  value: DebtFiltersValue; onChange: (value: DebtFiltersValue) => void; members: HouseholdMember[];
  showArchived: boolean; onArchivedChange: (value: boolean) => void; archivedCount: number; count: number
}) {
  const activeFilters = [value.member, value.type, value.status].filter(Boolean).length
  const select = 'h-10 min-w-0 w-full rounded-lg border border-white/10 bg-[#151716] px-3 text-xs text-slate-300 outline-none focus:border-[#a9b8a9]'
  return <div className="border-b border-white/[.08] p-4 sm:p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-baseline gap-2"><h2 className="text-base font-semibold">Accounts</h2><span className="text-xs text-slate-500">{count} shown</span></div>
      <div className="flex gap-1 rounded-lg border border-white/[.08] bg-black/10 p-1" aria-label="Account visibility">
        <Button size="small" variant={showArchived ? 'ghost' : 'secondary'} aria-pressed={!showArchived} onClick={() => onArchivedChange(false)}>Active</Button>
        <Button size="small" variant={showArchived ? 'secondary' : 'ghost'} aria-pressed={showArchived} onClick={() => onArchivedChange(true)}>Archived{archivedCount > 0 ? ` (${archivedCount})` : ''}</Button>
      </div>
    </div>
    <div className="flex flex-wrap gap-2"><div className="relative min-w-0 flex-[1_1_240px]"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-500"/><Input aria-label="Search debts" placeholder="Search accounts…" value={value.query} onChange={event => onChange({ ...value, query: event.target.value })} className="pl-9"/></div>
      <select aria-label="Sort debts" className={select + ' w-auto flex-[0_1_170px]'} value={value.sort} onChange={event => onChange({ ...value, sort: event.target.value })}><option value="updated">Recently updated</option><option value="balance">Highest balance</option><option value="creditor">Creditor name</option></select>
    </div>
    <details className="group mt-3" open={activeFilters > 0 || undefined}><summary className="flex w-fit cursor-pointer list-none items-center gap-2 text-xs text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-[#a9b8a9] [&::-webkit-details-marker]:hidden"><SlidersHorizontal size={13}/>Filters{activeFilters > 0 && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{activeFilters}</span>}</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-3"><select aria-label="Filter by member" className={select} value={value.member} onChange={event => onChange({ ...value, member: event.target.value })}><option value="">All members</option>{members.map(member => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select>
        <select aria-label="Filter by type" className={select} value={value.type} onChange={event => onChange({ ...value, type: event.target.value })}><option value="">All types</option>{Object.entries(debtTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select aria-label="Filter by payment status" className={select} value={value.status} onChange={event => onChange({ ...value, status: event.target.value })}><option value="">All statuses</option>{Object.entries(paymentStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      </div>
      {activeFilters > 0 && <Button size="small" variant="ghost" className="mt-2" onClick={() => onChange({ ...emptyDebtFilters, query: value.query, sort: value.sort })}>Reset filters</Button>}
    </details>
  </div>
}
