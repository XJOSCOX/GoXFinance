import { useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import type { FinancialCategory, HouseholdMember } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { Select } from '../../../components/ui/FormField'

export function BillsToolbar({
  kind,
  setKind,
  query,
  setQuery,
  member,
  setMember,
  category,
  setCategory,
  members,
  categories,
}: {
  kind: string
  setKind: (value: string) => void
  query: string
  setQuery: (value: string) => void
  member: string
  setMember: (value: string) => void
  category: string
  setCategory: (value: string) => void
  members: HouseholdMember[]
  categories: FinancialCategory[]
}) {
  const [open, setOpen] = useState(false)
  const count = Number(!!member) + Number(!!category)
  return (
    <section aria-label="Bill filters" className="mb-4 border-b border-white/[.08] pb-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="group" aria-label="Bill type">
          {[
            ['recurring', 'Recurring'],
            ['one_time', 'One-time'],
          ].map(([value, label]) => (
            <Button
              key={value}
              size="small"
              aria-pressed={kind === value}
              variant={kind === value ? 'primary' : 'ghost'}
              onClick={() => setKind(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-56">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-2.5 text-slate-500"
            />
            <Input
              className="h-9 pl-9"
              aria-label="Search bills"
              placeholder="Search bills"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button
            size="small"
            variant={count ? 'secondary' : 'ghost'}
            aria-expanded={open}
            aria-controls="bill-filter-options"
            onClick={() => setOpen(!open)}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            Filters{count ? ` (${count})` : ''}
          </Button>
        </div>
      </div>
      {open && (
        <div id="bill-filter-options" className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            className="w-full sm:w-48"
            aria-label="Filter member"
            value={member}
            onChange={(e) => setMember(e.target.value)}
          >
            <option value="">All members</option>
            {members.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </Select>
          <Select
            className="w-full sm:w-48"
            aria-label="Filter category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.archived ? ' (archived)' : ''}
              </option>
            ))}
          </Select>
          {!!count && (
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                setMember('')
                setCategory('')
              }}
            >
              <X size={13} aria-hidden="true" />
              Clear filters
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
