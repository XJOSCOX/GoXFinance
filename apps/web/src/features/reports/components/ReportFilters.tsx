import {
  reportKinds,
  reportKindLabels,
  type ReportFilters as Filters,
  type ReportOptions,
} from '@goxfinance/shared'
import { FormField, Select } from '../../../components/ui/FormField'
import { Input, Button } from '../../../components/ui'
export function ReportFilters({
  value,
  change,
  options,
  busy,
  onPreview,
}: {
  value: Filters
  change: (v: Filters) => void
  options: ReportOptions
  busy: boolean
  onPreview: () => void
}) {
  const set = (key: keyof Filters, v: string) => change({ ...value, [key]: v || null })
  function month(value: string) {
    if (!value) return
    const d = new Date(value + '-01T00:00:00Z')
    d.setUTCMonth(d.getUTCMonth() + 1)
    d.setUTCDate(0)
    change({ ...valueFilters, from: value + '-01', to: d.toISOString().slice(0, 10) })
  }
  const valueFilters = value
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onPreview()
      }}
      className="space-y-4 rounded-xl border border-white/10 bg-white/[.025] p-4"
    >
      <fieldset disabled={busy} className="contents">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="Report">
            <Select value={value.kind} onChange={(e) => set('kind', e.target.value)}>
              {reportKinds.map((k) => (
                <option key={k} value={k}>
                  {reportKindLabels[k]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Month shortcut">
            <Input
              type="month"
              value={value.from.slice(0, 7)}
              onChange={(e) => month(e.target.value)}
            />
          </FormField>
          <FormField label="From">
            <Input
              required
              type="date"
              value={value.from}
              onChange={(e) => set('from', e.target.value)}
            />
          </FormField>
          <FormField label="Through">
            <Input
              required
              type="date"
              min={value.from}
              value={value.to}
              onChange={(e) => set('to', e.target.value)}
            />
          </FormField>
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-slate-300">
            Scope and additional filters
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <FormField label="Year shortcut">
              <Input
                type="number"
                min="1900"
                max="9998"
                placeholder="Choose year"
                onChange={(e) => {
                  const y = e.target.value
                  if (/^\d{4}$/.test(y)) change({ ...value, from: y + '-01-01', to: y + '-12-31' })
                }}
              />
            </FormField>
            {(
              [
                ['memberId', 'Member', options.members],
                ['categoryId', 'Financial category', options.categories],
                ['debtId', 'Debt account', options.debts],
                ['accountId', 'Trading account', options.accounts],
                ['groupId', 'Copy group', options.groups],
              ] as const
            ).map(([key, label, rows]) => (
              <FormField key={key} label={label}>
                <Select value={value[key] ?? ''} onChange={(e) => set(key, e.target.value)}>
                  <option value="">
                    {key === 'memberId' && !options.owner
                      ? 'My associated records'
                      : 'All in scope'}
                  </option>
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Category filters apply to spending and budget rows. Debt filters apply to debt-related
            records. Account and group filters apply to trading. Joint member associations are not
            separate shares.
          </p>
        </details>
      </fieldset>
      <Button type="submit" disabled={busy}>
        {busy ? 'Preparing…' : 'Preview report'}
      </Button>
    </form>
  )
}
