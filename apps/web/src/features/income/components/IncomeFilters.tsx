import type { HouseholdMember } from '@goxfinance/shared'
import { Input } from '../../../components/ui'
import { Select, FormField } from '../../../components/ui/FormField'
export function IncomeFilters({
  tab,
  month,
  setMonth,
  historyMonth,
  setHistoryMonth,
  historyMonths,
  member,
  setMember,
  query,
  setQuery,
  status,
  setStatus,
  members,
}: {
  tab: string
  month: string
  setMonth: (v: string) => void
  historyMonth: string
  setHistoryMonth: (v: string) => void
  historyMonths: string[]
  member: string
  setMember: (v: string) => void
  query: string
  setQuery: (v: string) => void
  status: string
  setStatus: (v: string) => void
  members: HouseholdMember[]
}) {
  if (tab === 'overview')
    return (
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <label className="flex items-center gap-3 text-xs text-slate-400">
          Period
          <Input
            aria-label="Reporting month"
            className="w-44"
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value)
            }}
          />
        </label>
        <details className="relative max-w-full" open={member || query ? true : undefined}>
          <summary className="cursor-pointer rounded-lg border border-white/10 px-3 py-2.5 text-xs text-slate-400">
            Filter income{member || query ? ' (active)' : ''}
          </summary>
          <div className="mt-3 flex flex-wrap gap-3">
            <FormField label="Earning member">
              <Select value={member} onChange={(e) => setMember(e.target.value)}>
                <option value="">All members</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Search sources">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Employer or source"
              />
            </FormField>
          </div>
        </details>
      </div>
    )
  return (
    <div className="mb-5 grid items-end gap-3 border-b border-white/8 pb-5 sm:grid-cols-2 xl:grid-cols-4">
      {tab === 'history' ? (
        <FormField label="Paycheck dates">
          <Select value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)}>
            <option value="">All dates</option>
            {historyMonths.map((m) => (
              <option key={m} value={m}>
                {new Date(m + '-01T12:00:00Z').toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </option>
            ))}
          </Select>
        </FormField>
      ) : tab !== 'sources' ? (
        <FormField label="Reporting month">
          <Input
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value)
            }}
          />
        </FormField>
      ) : null}
      <FormField label="Earning member">
        <Select value={member} onChange={(e) => setMember(e.target.value)}>
          <option value="">All members</option>
          {members.map((v) => (
            <option key={v.id} value={v.id}>
              {v.fullName}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Search sources">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Employer or source"
        />
      </FormField>
      {tab === 'history' && (
        <FormField label="Paycheck status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['expected', 'pending', 'confirmed', 'cancelled'].map((v) => (
              <option key={v} value={v}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </option>
            ))}
          </Select>
        </FormField>
      )}
    </div>
  )
}
