import { useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import type { TradingData } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { Select } from '../../../components/ui/FormField'
import { goalCategories } from '../goal-display'
export function GoalsToolbar({
  query,
  setQuery,
  period,
  setPeriod,
  account,
  setAccount,
  trading,
  selecting,
  setSelecting,
  canSelect,
  category,
  setCategory,
  order,
  setOrder,
  grouped,
  setGrouped,
}: {
  query: string
  setQuery: (v: string) => void
  period: string
  setPeriod: (v: string) => void
  account: string
  setAccount: (v: string) => void
  trading: TradingData | null
  selecting: boolean
  setSelecting: (v: boolean) => void
  canSelect: boolean
  category: string
  setCategory: (v: string) => void
  order: string
  setOrder: (v: string) => void
  grouped: boolean
  setGrouped: (v: boolean) => void
}) {
  const [open, setOpen] = useState(false),
    count = Number(!!period) + Number(!!account) + Number(!!category)
  return (
    <section className="mb-4" aria-label="Goal filters">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-64">
          <Search size={14} aria-hidden="true" className="absolute left-3 top-3 text-slate-500" />
          <Input
            aria-label="Search goals"
            placeholder="Search targets"
            className="h-9 pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select
          className="h-9 w-auto max-w-44"
          aria-label="Sort goals"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
        >
          <option value="due">Due date</option>
          <option value="category">Category</option>
          <option value="progress">Most progress</option>
          <option value="remaining">Remaining / overage</option>
          <option value="name">Name</option>
        </Select>
        <Button
          size="small"
          variant="ghost"
          aria-expanded={open}
          aria-controls="goal-filter-options"
          onClick={() => setOpen(!open)}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          Filters{count ? ` (${count})` : ''}
        </Button>
        {canSelect && (
          <Button
            size="small"
            variant="ghost"
            aria-pressed={selecting}
            onClick={() => setSelecting(!selecting)}
          >
            {selecting ? 'Done selecting' : 'Select accounts'}
          </Button>
        )}
      </div>
      {open && (
        <div id="goal-filter-options" className="mt-3 flex flex-wrap gap-2">
          <Select
            className="sm:w-44"
            aria-label="Filter goal category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {goalCategories.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </Select>
          <Select
            className="sm:w-44"
            aria-label="Filter goal period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="">All periods</option>
            {['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={grouped}
              onChange={(e) => setGrouped(e.target.checked)}
            />
            Group by category
          </label>
          <Select
            className="sm:w-64"
            aria-label="Filter linked account"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">All accounts / combined</option>
            {trading?.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
          </Select>
          {!!count && (
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                setPeriod('')
                setAccount('')
                setCategory('')
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
