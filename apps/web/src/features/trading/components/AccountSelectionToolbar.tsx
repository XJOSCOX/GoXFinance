import { Button } from '../../../components/ui'

export function AccountSelectionToolbar({
  accounts,
  selected,
  onChange,
}: {
  accounts: { id: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-400">
        {selected.length} of {accounts.length} accounts selected
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="small"
          disabled={selected.length === accounts.length}
          onClick={() => onChange(accounts.map((a) => a.id))}
        >
          Select all accounts
        </Button>
        <Button
          type="button"
          size="small"
          variant="ghost"
          disabled={!selected.length}
          onClick={() => onChange([])}
        >
          Clear selection
        </Button>
      </div>
    </div>
  )
}
