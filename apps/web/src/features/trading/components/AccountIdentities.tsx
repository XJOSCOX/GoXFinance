import { Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'

export interface AccountIdentity {
  nickname: string
  maskedExternalId: string
}
export function AccountIdentities({
  rows,
  count,
  onCount,
  onChange,
}: {
  rows: AccountIdentity[]
  count: number
  onCount: (count: number) => void
  onChange: (index: number, field: keyof AccountIdentity, value: string) => void
}) {
  return (
    <section className="space-y-4 rounded-xl border border-white/10 p-4">
      <FormField label="Number of accounts">
        <Select value={count} onChange={(e) => onCount(Number(e.target.value))}>
          {Array.from({ length: 20 }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </Select>
      </FormField>
      <p className="text-xs text-slate-400">
        Use the setup below for all new accounts. Each account keeps its own history.
      </p>
      {rows.slice(0, count).map((row, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-2">
          <FormField label={`Account ${i + 1} nickname`}>
            <Input
              value={row.nickname}
              onChange={(e) => onChange(i, 'nickname', e.target.value)}
              required
              maxLength={120}
            />
          </FormField>
          <FormField label={`Account ${i + 1} identifier (last four, optional)`}>
            <Input
              value={row.maskedExternalId}
              onChange={(e) => onChange(i, 'maskedExternalId', e.target.value)}
              maxLength={12}
            />
          </FormField>
        </div>
      ))}
    </section>
  )
}
