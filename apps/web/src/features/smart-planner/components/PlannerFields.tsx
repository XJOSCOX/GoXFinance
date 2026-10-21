import type { ForecastSources, PlannerInput, PlannerTarget } from '@goxfinance/shared'
import { FormField, Select } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { DateField } from '../../../components/financial/EntryFields'
export function TargetField({
  sources,
  value,
  kinds,
  name = 'target',
  optional = false,
}: {
  sources: ForecastSources
  value?: PlannerTarget | null
  kinds: PlannerTarget['kind'][]
  name?: string
  optional?: boolean
}) {
  const options: { value: string; name: string }[] = []
  if (kinds.includes('bill'))
    for (const b of sources.bills) options.push({ value: 'bill:' + b.id, name: b.name })
  if (kinds.includes('bill_period'))
    for (const b of sources.bills)
      for (const p of b.periods)
        options.push({ value: 'bill_period:' + p.id, name: b.name + ' · ' + p.dueDate })
  if (kinds.includes('debt'))
    for (const d of sources.debts.filter((d) => !d.isArchived))
      options.push({ value: 'debt:' + d.id, name: d.creditorName })
  if (kinds.includes('expense'))
    for (const e of sources.expenses.filter((e) => !e.voided))
      options.push({ value: 'expense:' + e.id, name: e.description })
  if (kinds.includes('goal'))
    for (const g of sources.planner?.goals ?? [])
      options.push({ value: 'goal:' + g.id, name: g.name })
  return (
    <FormField label="Existing obligation">
      <Select
        name={name}
        defaultValue={value ? value.kind + ':' + value.id : ''}
        required={!optional}
      >
        <option value="">{optional ? 'General reserve' : 'Select an existing obligation'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.name}
          </option>
        ))}
      </Select>
    </FormField>
  )
}

export function AccountField({
  sources,
  value,
  name = 'accountId',
  optional = true,
}: {
  sources: ForecastSources
  value?: string | null
  name?: string
  optional?: boolean
}) {
  return (
    <FormField label="Payment account">
      <Select name={name} defaultValue={value ?? ''} required={!optional}>
        <option value="">Unknown / confirm before payment</option>
        {sources.cashAccounts
          ?.filter((a) => a.type !== 'credit_card' && a.status === 'active' && a.currency === 'USD')
          .map((a) => (
            <option value={a.id} key={a.id}>
              {a.name}
            </option>
          ))}
      </Select>
    </FormField>
  )
}
export function VerificationFields({
  value,
}: {
  value?: Extract<PlannerInput, { kind: 'priority' | 'arrangement' | 'advance' }>['verification']
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-white/10 p-4">
      <legend className="px-2 text-sm font-medium">Agreement evidence</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="verified" defaultChecked={value?.verified} />I verified these
        terms with the provider or official document
      </label>
      <FormField label="Evidence / source">
        <Input
          name="proof"
          defaultValue={value?.source}
          placeholder="Agreement date, provider contact, or document reference"
          maxLength={1000}
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Verified at (local time)">
          <Input
            type="datetime-local"
            name="verifiedAt"
            defaultValue={
              value?.verifiedAt
                ? new Date(
                    Date.parse(value.verifiedAt) -
                      new Date(value.verifiedAt).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : ''
            }
          />
        </FormField>
        <DateField
          name="validThrough"
          label="Terms valid through (optional)"
          value={value?.validThrough}
        />
      </div>
    </fieldset>
  )
}

export function PaymentLinks({
  sources,
  name,
  values = [],
}: {
  sources: ForecastSources
  name: string
  values?: { kind: 'bill' | 'debt'; id: string }[]
}) {
  return (
    <FormField label="Existing payment links (optional)">
      <Select
        multiple
        name={name}
        defaultValue={values.map((v) => v.kind + ':' + v.id)}
        className="h-24"
      >
        <optgroup label="Debt payments">
          {sources.payments.map((p) => (
            <option key={p.id} value={'debt:' + p.id}>
              {p.paymentDate} · {p.amountCents / 100} USD · {p.paymentStatus}
            </option>
          ))}
        </optgroup>
        <optgroup label="Bill payments">
          {sources.bills.flatMap((b) =>
            b.payments
              .filter((p) => !p.debtPaymentId)
              .map((p) => (
                <option key={p.id} value={'bill:' + p.id}>
                  {b.name} · {p.paymentDate} · {p.status}
                </option>
              )),
          )}
        </optgroup>
      </Select>
    </FormField>
  )
}
