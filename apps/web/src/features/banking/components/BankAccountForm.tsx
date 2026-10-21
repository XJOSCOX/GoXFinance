import { bankAccountSchema, type BankAccount, type BankingData } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { FormField, Select } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { useState } from 'react'
import { BankAccountMapping } from './BankAccountMapping'
export function BankAccountForm({
  data,
  record,
  save,
  close,
  home,
}: {
  data: BankingData
  record?: BankAccount
  save: (body: unknown) => Promise<void>
  close: () => void
  home: string
}) {
  const [type, setType] = useState(record?.type ?? 'checking')
  return (
    <FinancialEditor
      title={record ? 'Edit bank account' : 'Add manual account'}
      record={record}
      save={save}
      close={close}
      submitLabel="Save account"
      build={(form) =>
        bankAccountSchema.parse({
          name: form.get('name'),
          institution: form.get('institution'),
          type: record?.connectionId ? record.type : form.get('type'),
          subtype: record?.subtype ?? null,
          mask: String(form.get('mask') || '') || null,
          currency: String(form.get('currency') || '').toUpperCase() || null,
          memberIds: form.getAll('members'),
          status: form.get('status'),
          assetId: String(form.get('assetId') || '') || null,
          debtId: String(form.get('debtId') || '') || null,
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Account nickname">
          <Input
            placeholder="A short name for this account"
            name="name"
            defaultValue={record?.name}
            required
            maxLength={120}
          />
        </FormField>
        <FormField label="Institution">
          <Input
            name="institution"
            readOnly={!!record?.connectionId}
            defaultValue={record?.institution}
            required
            maxLength={160}
          />
        </FormField>
        <FormField label="Account type">
          <Select
            name="type"
            disabled={!!record?.connectionId}
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="credit_card">Credit card</option>
            <option value="other_depository">Other depository</option>
          </Select>
        </FormField>
        <FormField label="Last four digits (optional)">
          <Input
            name="mask"
            readOnly={!!record?.connectionId}
            defaultValue={record?.mask ?? ''}
            maxLength={4}
            pattern="[0-9]{1,4}"
          />
        </FormField>
        <FormField label="Currency (optional)">
          <Input
            name="currency"
            readOnly={!!record?.connectionId}
            placeholder="USD"
            defaultValue={record?.currency ?? ''}
            maxLength={3}
            pattern="[A-Za-z]{3}"
          />
        </FormField>
        <FormField label="Visibility">
          <Select name="status" defaultValue={record?.status ?? 'active'}>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
          </Select>
        </FormField>
      </div>
      <BankAccountMapping
        home={home}
        credit={type === 'credit_card'}
        assetId={record?.assetId}
        debtId={record?.debtId}
      />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Members allowed to view this account</legend>
        <p className="mb-3 text-xs text-slate-400">
          The household Owner retains access. Select other members explicitly.
        </p>
        <div className="flex flex-wrap gap-3">
          {data.members.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-sm"
            >
              <input
                type="checkbox"
                name="members"
                value={m.id}
                defaultChecked={record?.memberIds.includes(m.id) ?? false}
              />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>
    </FinancialEditor>
  )
}
