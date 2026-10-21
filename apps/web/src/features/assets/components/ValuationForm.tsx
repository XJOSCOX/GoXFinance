import { useRef } from 'react'
import { valuationSchema, localBillDate, type Asset, type AssetData } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { readMoney, text, optionalText } from '../../../lib/financial-entry'
import { formatMoney } from '../../../lib/money'
export function ValuationForm({
  asset,
  data,
  save,
  close,
}: {
  asset: Asset
  data: AssetData
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const key = useRef(crypto.randomUUID()),
    superseded = new Set(data.valuations.map((v) => v.supersedesId))
  return (
    <FinancialEditor
      title={'Record value · ' + asset.name}
      record={asset}
      save={(body) => save({ ...(body as object), idempotencyKey: key.current })}
      close={close}
      submitLabel="Save valuation"
      build={(f) =>
        valuationSchema.parse({
          valueCents: readMoney(f, 'value'),
          valuationDate: text(f, 'date'),
          source: text(f, 'source'),
          confidence: text(f, 'confidence'),
          notes: optionalText(f, 'notes'),
          supersedesId: optionalText(f, 'supersedes'),
        })
      }
    >
      <p className="text-xs text-slate-400">
        A new dated record preserves the existing history. For a correction, select the earlier
        record it replaces.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <AmountField label="Estimated / recorded value ($)" name="value" />
        <DateField label="Valuation date" name="date" value={localBillDate()} required />
        <FormField label="Source">
          <Input name="source" required defaultValue="Manual estimate" />
        </FormField>
        <FormField label="Confidence">
          <Select name="confidence" defaultValue="estimated">
            <option>unverified</option>
            <option>estimated</option>
            <option>confirmed</option>
          </Select>
        </FormField>
      </div>
      <FormField label="Correct an earlier valuation (optional)">
        <Select name="supersedes" defaultValue="">
          <option value="">New valuation, no correction</option>
          {data.valuations
            .filter((v) => v.assetId === asset.id && !superseded.has(v.id))
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.valuationDate} · {formatMoney(v.valueCents)} · {v.source}
              </option>
            ))}
        </Select>
      </FormField>
      <FormField label="Notes">
        <Input placeholder="Add optional details or context" name="notes" />
      </FormField>
    </FinancialEditor>
  )
}
