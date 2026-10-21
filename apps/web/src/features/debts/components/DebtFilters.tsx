import { useEffect, useRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import {
  debtTypeLabels,
  paymentStatusLabels,
  type FinancialCategory,
  type HouseholdMember,
} from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'

import { emptyDebtFilters, type DebtFiltersValue } from '../lib/debt-filters'

function DebtSelect({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-medium text-slate-400">{label}</span>
      <span className="relative block">
        <select
          {...props}
          className="h-10 w-full min-w-0 appearance-none rounded-lg border border-white/10 bg-[#151716] pl-3 pr-8 text-xs text-slate-200 outline-none transition hover:border-white/20 focus:border-[#a9b8a9] focus:ring-1 focus:ring-[#a9b8a9]"
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3 text-slate-500"
        />
      </span>
    </label>
  )
}

export function DebtFilters({
  value,
  onChange,
  members,
  showArchived,
  onArchivedChange,
  archivedCount,
  count,
  categories,
  category,
  onCategoryChange,
}: {
  categories: FinancialCategory[]
  category: string
  onCategoryChange: (value: string) => void
  value: DebtFiltersValue
  onChange: (value: DebtFiltersValue) => void
  members: HouseholdMember[]
  showArchived: boolean
  onArchivedChange: (value: boolean) => void
  archivedCount: number
  count: number
}) {
  const activeFilters = [value.member, value.type, value.status, category].filter(Boolean).length
  const panel = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) panel.current.open = false
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  return (
    <div className="border-b border-white/[.08] pb-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">Accounts</h2>
          <span className="text-xs text-slate-500">{count} shown</span>
        </div>
        <div
          className="flex gap-1 rounded-lg border border-white/[.08] bg-black/10 p-1"
          aria-label="Account visibility"
        >
          <Button
            size="small"
            variant={showArchived ? 'ghost' : 'secondary'}
            aria-pressed={!showArchived}
            onClick={() => onArchivedChange(false)}
          >
            Active
          </Button>
          <Button
            size="small"
            variant={showArchived ? 'secondary' : 'ghost'}
            aria-pressed={showArchived}
            onClick={() => onArchivedChange(true)}
          >
            Archived{archivedCount > 0 ? ` (${archivedCount})` : ''}
          </Button>
        </div>
      </div>
      <div className="relative flex flex-wrap items-center justify-end gap-2">
        <div className="relative mr-auto min-w-0 flex-[1_1_200px] sm:max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <Input
            aria-label="Search debts"
            placeholder="Search accounts…"
            value={value.query}
            onChange={(event) => onChange({ ...value, query: event.target.value })}
            className="h-10 pl-9 pr-9 text-xs"
          />
          {value.query && (
            <button
              type="button"
              aria-label="Clear debt search"
              onClick={() => onChange({ ...value, query: '' })}
              className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-white/5 focus-visible:outline focus-visible:outline-[#a9b8a9]"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="relative min-w-0 flex-[0_1_170px]">
          <select
            aria-label="Sort debts"
            className="h-10 w-full appearance-none rounded-lg border border-white/10 bg-[#151716] pl-3 pr-8 text-xs text-slate-300 outline-none hover:border-white/20 focus:ring-1 focus:ring-[#a9b8a9]"
            value={value.sort}
            onChange={(event) => onChange({ ...value, sort: event.target.value })}
          >
            <option value="updated">Recently updated</option>
            <option value="balance">Highest balance</option>
            <option value="creditor">Creditor name</option>
          </select>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-3 text-slate-500"
          />
        </div>
        <details
          ref={panel}
          className="group"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.currentTarget.open = false
              event.currentTarget.querySelector('summary')?.focus()
            }
          }}
        >
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 h-10 rounded-lg border border-white/10 px-3 text-xs text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-[#a9b8a9] [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal size={13} />
            Filters
            {activeFilters > 0 && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{activeFilters}</span>
            )}
          </summary>
          <div className="absolute right-0 top-full mt-2 z-20 grid w-[min(26rem,calc(100vw-3rem))] gap-2 rounded-xl border border-white/10 bg-[#222522] p-3 shadow-xl sm:grid-cols-2">
            <DebtSelect
              label="Category"
              aria-label="Filter debt category"
              value={category}
              onChange={(event) => onCategoryChange(event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archived ? ' (archived)' : ''}
                </option>
              ))}
            </DebtSelect>
            <DebtSelect
              label="Responsible member"
              aria-label="Filter by member"
              value={value.member}
              onChange={(event) => onChange({ ...value, member: event.target.value })}
            >
              <option value="">All members</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName}
                </option>
              ))}
            </DebtSelect>
            <DebtSelect
              label="Account type"
              aria-label="Filter by type"
              value={value.type}
              onChange={(event) => onChange({ ...value, type: event.target.value })}
            >
              <option value="">All types</option>
              {Object.entries(debtTypeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </DebtSelect>
            <DebtSelect
              label="Payment status"
              aria-label="Filter by payment status"
              value={value.status}
              onChange={(event) => onChange({ ...value, status: event.target.value })}
            >
              <option value="">All statuses</option>
              {Object.entries(paymentStatusLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </DebtSelect>
            <div className="col-span-full flex items-center justify-between gap-2 border-t border-white/10 pt-2">
              {activeFilters > 0 && (
                <Button
                  size="small"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => {
                    onChange({ ...emptyDebtFilters, query: value.query, sort: value.sort })
                    onCategoryChange('')
                  }}
                >
                  Reset filters
                </Button>
              )}
              <Button
                size="small"
                className="ml-auto"
                onClick={() => {
                  if (panel.current) panel.current.open = false
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </details>
      </div>
    </div>
  )
}
