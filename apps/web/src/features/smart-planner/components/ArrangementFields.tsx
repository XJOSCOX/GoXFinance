import { useState } from 'react'
import type { ForecastSources, PlannerInput } from '@goxfinance/shared'
import { Input, Button } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { PaymentLinks } from './PlannerFields'
export function ArrangementFields({
  sources,
  value,
}: {
  sources: ForecastSources
  value?: Extract<PlannerInput, { kind: 'arrangement' }>
}) {
  const [rows, setRows] = useState(
    value?.installments.map((i) => i.id) ?? [crypto.randomUUID(), crypto.randomUUID()],
  )
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Arrangement type">
          <Select name="arrangementType" defaultValue={value?.arrangementType ?? 'split'}>
            <option value="split">Split payment</option>
            <option value="bnpl">Buy now, pay later</option>
          </Select>
        </FormField>
        <FormField label="Provider">
          <Input
            name="provider"
            required
            defaultValue={value?.provider}
            placeholder="Landlord, creditor, or installment provider"
          />
        </FormField>
        <AmountField
          name="original"
          label="Original obligation (USD)"
          value={value?.originalCents}
          required
        />
        <AmountField
          name="financed"
          label="Amount financed (USD)"
          value={value?.financedCents}
          required
        />
        <AmountField
          name="down"
          label="Down payment (USD)"
          value={value?.downPaymentCents ?? 0}
          required
        />
        <FormField label="Original purchase (BNPL only)">
          <Select name="expenseId" defaultValue={value?.expenseId ?? ''}>
            <option value="">No purchase link</option>
            {sources.expenses
              .filter((e) => !e.voided && e.linkedDebtId && e.paymentMethod === 'credit_card')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.description}
                </option>
              ))}
          </Select>
        </FormField>
        <DateField
          name="coverageStart"
          label="Coverage starts"
          value={value?.coverageStart}
          required
        />
        <DateField name="coverageEnd" label="Coverage ends" value={value?.coverageEnd} required />
        <FormField label="Plan status">
          <Select name="status" defaultValue={value?.status ?? 'proposed'}>
            {['proposed', 'accepted', 'active', 'completed', 'cancelled', 'defaulted'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FormField>
      </div>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" name="replacesOriginal" defaultChecked={value?.replacesOriginal} />
        Provider confirmed these installments replace the original due schedule
      </label>
      <p className="text-xs text-slate-400">
        Proposed or unverified terms leave the original obligation due. Partial payment alone does
        not establish legal sufficiency.
      </p>
      <div className="space-y-3">
        {rows.map((id, index) => {
          const old = value?.installments.find((i) => i.id === id)
          return (
            <fieldset key={id} className="rounded-lg border border-white/10 p-4">
              <legend className="px-2 text-sm">Installment {index + 1}</legend>
              <input type="hidden" name="installmentId" value={id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <DateField label="Due date" name={id + 'Date'} value={old?.date} required />
                <AmountField
                  name={id + 'Principal'}
                  label="Principal (USD)"
                  value={old?.principalCents}
                  required
                />
                <AmountField
                  name={id + 'Fees'}
                  label="Fees / penalties (USD)"
                  value={old?.feesCents ?? 0}
                  required
                />
                <AmountField
                  name={id + 'Interest'}
                  label="Interest (USD)"
                  value={old?.interestCents ?? 0}
                  required
                />
              </div>
              <div className="mt-3">
                <PaymentLinks sources={sources} name={id + 'Payments'} values={old?.payments} />
              </div>
              {rows.length > 1 && (
                <Button
                  type="button"
                  size="small"
                  onClick={() => setRows(rows.filter((r) => r !== id))}
                >
                  Remove installment
                </Button>
              )}
            </fieldset>
          )
        })}
        <Button
          type="button"
          onClick={() => setRows([...rows, crypto.randomUUID()])}
          disabled={rows.length >= 360}
        >
          Add installment
        </Button>
      </div>
    </>
  )
}
