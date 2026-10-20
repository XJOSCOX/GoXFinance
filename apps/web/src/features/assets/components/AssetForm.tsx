import {
  assetSchema,
  createAssetSchema,
  localBillDate,
  type Asset,
  type AssetData,
} from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { readMoney, text, optionalText } from '../../../lib/financial-entry'
export function AssetForm({
  data,
  record,
  save,
  close,
}: {
  data: AssetData
  record?: Asset
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  return (
    <FinancialEditor
      title={record ? 'Edit asset' : 'Add asset'}
      record={record}
      save={save}
      close={close}
      submitLabel="Save asset"
      build={(f) => {
        const values = {
          name: text(f, 'name'),
          category: text(f, 'category'),
          acquisitionDate: optionalText(f, 'acquired'),
          purchaseCents: readMoney(f, 'purchase'),
          notes: optionalText(f, 'notes'),
          status: text(f, 'status'),
          memberIds: f.getAll('member').map(String),
          debtIds: f.getAll('debt').map(String),
        }
        return record
          ? assetSchema.parse(values)
          : createAssetSchema.parse({
              ...values,
              valuation: {
                valueCents: readMoney(f, 'value'),
                valuationDate: text(f, 'date'),
                source: text(f, 'source'),
                confidence: text(f, 'confidence'),
                notes: null,
                supersedesId: null,
              },
            })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Asset name">
          <Input name="name" required defaultValue={record?.name ?? ''} />
        </FormField>
        <FormField label="Asset type">
          <Select name="category" defaultValue={record?.category ?? 'vehicle'}>
            {[
              'vehicle',
              'real_estate',
              'cash',
              'checking',
              'savings',
              'brokerage',
              'retirement',
              'business',
              'other',
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </FormField>
        <DateField label="Acquisition date" name="acquired" value={record?.acquisitionDate} />
        <AmountField
          label="Purchase price ($), optional"
          name="purchase"
          value={record?.purchaseCents}
        />
        <FormField label="Status">
          <Select name="status" defaultValue={record?.status ?? 'active'}>
            <option>active</option>
            <option>archived</option>
          </Select>
        </FormField>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm">Owners / responsible members</legend>
        <div className="flex flex-wrap gap-3">
          {data.members.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="member"
                value={m.id}
                defaultChecked={record?.memberIds.includes(m.id)}
              />
              {m.fullName}
            </label>
          ))}
        </div>
      </fieldset>
      <details>
        <summary className="cursor-pointer text-sm text-slate-400">
          Link existing secured liabilities
        </summary>
        <p className="my-2 text-xs text-slate-400">
          Links describe an association, not a new liability. Household debt is counted once.
        </p>
        {data.debts.map((d) => (
          <label key={d.id} className="my-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="debt"
              value={d.id}
              defaultChecked={record?.debtIds.includes(d.id)}
            />
            {d.accountNickname || d.creditorName}
          </label>
        ))}
      </details>
      {!record && (
        <section className="space-y-3 rounded-lg border border-white/10 p-3">
          <h3 className="text-sm font-semibold">Initial valuation</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <AmountField label="Current value ($)" name="value" />
            <DateField label="Valuation date" name="date" value={localBillDate()} required />
            <FormField label="Valuation source">
              <Input name="source" defaultValue="Manual estimate" required />
            </FormField>
            <FormField label="Valuation confidence">
              <Select name="confidence" defaultValue="unverified">
                <option>unverified</option>
                <option>estimated</option>
                <option>confirmed</option>
              </Select>
            </FormField>
          </div>
        </section>
      )}
      <FormField label="Notes">
        <Input name="notes" defaultValue={record?.notes ?? ''} />
      </FormField>
      <p className="text-xs text-slate-500">
        Purchase price is not a current valuation. Do not enter Combine/XFA nominal balances or
        unrealized profits as personal assets. Cash/checking amounts are manual balances; payouts do
        not automatically change them.
      </p>
    </FinancialEditor>
  )
}
