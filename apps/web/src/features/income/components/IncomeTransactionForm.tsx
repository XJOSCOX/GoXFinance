import { useState } from 'react'
import {
  incomeTransactionSchema,
  type IncomeSource,
  type IncomeTransaction,
  type IncomeTransactionInput,
} from '@goxfinance/shared'
import { Modal } from '../../../components/ui/Modal'
import { FormSection } from '../../../components/ui/FormSection'
import { FormField, Select } from '../../../components/ui/FormField'
import { Button, Input } from '../../../components/ui'
import { errorMessage } from '../../../lib/api'
import { IncomeMoneyField } from './IncomeMoneyField'
import { moneyInputs, parseMoneyInputs } from './income-money'
import { initialIncome, incomeMoneyFields } from './income-form-values'
import { IncomeWorkFields } from './IncomeWorkFields'
import { IncomeReceiptFields } from './IncomeReceiptFields'
export function IncomeTransactionForm({
  sources,
  existing,
  sourceId,
  date,
  close,
  save,
}: {
  sources: IncomeSource[]
  existing?: IncomeTransaction
  sourceId?: string
  date?: string
  close: () => void
  save: (values: IncomeTransactionInput, key: string, reason: string) => Promise<void>
}) {
  const [value, setValue] = useState(() =>
    initialIncome(
      sources.find((s) => s.id === (existing?.sourceId ?? sourceId)) ?? sources[0],
      existing,
      date,
    ),
  )
  const [money, setMoney] = useState(() => moneyInputs(incomeMoneyFields, value)),
    [key] = useState(() => crypto.randomUUID()),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const source = sources.find((s) => s.id === value.sourceId),
    type = existing?.incomeTypeSnapshot ?? source?.incomeType
  const update = <K extends keyof IncomeTransactionInput>(
    key: K,
    input: IncomeTransactionInput[K],
  ) => setValue((v) => ({ ...v, [key]: input }))
  return (
    <Modal
      title={existing ? 'Correct / confirm income' : 'Record income'}
      description="Review estimates separately from actual earnings and deposits."
      onClose={close}
      framed
      className="max-w-3xl"
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy) return
          setBusy(true)
          setError('')
          try {
            const fields = Object.fromEntries(
              Object.keys(incomeTransactionSchema.shape).map((k) => [
                k,
                value[k as keyof IncomeTransactionInput],
              ]),
            )
            await save(
              incomeTransactionSchema.parse({ ...fields, ...parseMoneyInputs(money) }),
              key,
              reason,
            )
            close()
          } catch (failure) {
            setError(errorMessage(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="min-h-0 space-y-6 overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Income source">
              <Select
                required
                disabled={!!existing}
                value={value.sourceId}
                onChange={(e) => {
                  const next = initialIncome(sources.find((s) => s.id === e.target.value))
                  setValue(next)
                  setMoney(moneyInputs(incomeMoneyFields, next))
                }}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status">
              <Select
                value={value.status}
                onChange={(e) =>
                  setValue((v) => ({
                    ...v,
                    status: e.target.value as IncomeTransactionInput['status'],
                    receiptConfirmed: false,
                  }))
                }
              >
                {['expected', 'pending', 'confirmed', 'cancelled'].map((v) => (
                  <option key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Pay date">
              <Input
                required
                type="date"
                value={value.payDate}
                onChange={(e) => update('payDate', e.target.value)}
              />
            </FormField>
            <FormField label="Reference (optional)">
              <Input
                placeholder="Confirmation or reference number"
                maxLength={160}
                value={value.reference ?? ''}
                onChange={(e) => update('reference', e.target.value || null)}
              />
            </FormField>
          </div>
          {type === 'hourly' && (
            <IncomeWorkFields value={value} update={update} money={money} setMoney={setMoney} />
          )}
          <IncomeReceiptFields
            value={value}
            update={update}
            money={money}
            setMoney={setMoney}
            trading={type === 'trading_payout'}
          />
          <FormSection title="Expected amounts & notes" collapsible>
            <div className="grid gap-4 sm:grid-cols-2">
              <IncomeMoneyField
                label="Expected gross ($)"
                value={money.expectedGrossCents}
                onChange={(v) => setMoney((m) => ({ ...m, expectedGrossCents: v }))}
              />
              <IncomeMoneyField
                label="Expected net ($)"
                value={money.expectedNetCents}
                onChange={(v) => setMoney((m) => ({ ...m, expectedNetCents: v }))}
              />
            </div>
            <FormField label="Notes">
              <Input
                placeholder="Add optional details or context"
                value={value.notes ?? ''}
                onChange={(e) => update('notes', e.target.value || null)}
              />
            </FormField>
          </FormSection>
          {existing && (
            <FormField label="Reason for correction / confirmation">
              <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
          )}
        </div>
        <footer className="shrink-0 border-t border-white/10 px-5 py-4">
          {error && (
            <p role="alert" className="mb-3 text-sm text-rose-300">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy}>
              {busy ? 'Saving…' : value.status === 'confirmed' ? 'Confirm deposit' : 'Save income'}
            </Button>
          </div>
        </footer>
      </form>
    </Modal>
  )
}
