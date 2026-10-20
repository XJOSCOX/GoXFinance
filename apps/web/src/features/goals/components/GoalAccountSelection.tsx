import { useState } from 'react'
import type { TradingAccount, TradingData } from '@goxfinance/shared'
import { Button } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'

export function GoalAccountSelection({
  trading,
  accounts,
  selected,
  onChange,
  editing = false,
}: {
  trading: TradingData | null
  accounts: TradingAccount[]
  selected: string[]
  onChange: (ids: string[]) => void
  editing?: boolean
}) {
  const [shortcut, setShortcut] = useState('')
  const select = (scope: string) => {
    setShortcut(scope)
    if (scope === 'combine' || scope === 'funded')
      onChange(
        accounts
          .filter((a) =>
            scope === 'combine' ? a.stage === 'combine' : ['xfa', 'lfa'].includes(a.stage),
          )
          .map((a) => a.id),
      )
    else {
      const group = trading?.groups.find((g) => g.id === scope)
      if (group)
        onChange(
          accounts.filter((a) => group.members.some((m) => m.accountId === a.id)).map((a) => a.id),
        )
    }
  }
  return (
    <section className="space-y-3 rounded-xl border border-white/10 p-4" aria-label="Goal accounts">
      {!editing && (
        <FormField label="Select accounts together">
          <Select value={shortcut} onChange={(e) => select(e.target.value)}>
            <option value="">Choose a group or account stage</option>
            <option value="combine">
              All active Combines ({accounts.filter((a) => a.stage === 'combine').length})
            </option>
            <option value="funded">
              All active funded accounts (
              {accounts.filter((a) => ['xfa', 'lfa'].includes(a.stage)).length})
            </option>
            {trading?.groups
              .filter((g) => g.status === 'active')
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} (
                  {accounts.filter((a) => g.members.some((m) => m.accountId === a.id)).length}{' '}
                  accounts)
                </option>
              ))}
          </Select>
        </FormField>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">{selected.length} accounts selected</p>
        {!editing && (
          <Button
            type="button"
            size="small"
            variant="ghost"
            onClick={() => {
              setShortcut('')
              onChange([])
            }}
          >
            Clear selection
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {accounts.map((a) => (
          <label
            key={a.id}
            className="flex items-center gap-2 rounded-lg bg-white/[.025] p-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.includes(a.id)}
              disabled={editing}
              onChange={(e) => {
                setShortcut('')
                onChange(
                  e.target.checked ? [...selected, a.id] : selected.filter((id) => id !== a.id),
                )
              }}
            />
            {a.nickname}
            <span className="ml-auto text-[11px] text-slate-500">
              {a.stage === 'combine' ? 'Combine' : a.stage.toUpperCase()}
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs leading-5 text-slate-400">
        One goal per selected account. The target applies to each account, not a pooled passing
        target. All recorded results for each account count, including daily summaries. Later group
        membership changes do not add or remove goals.
      </p>
    </section>
  )
}
