import { useRef, useState } from 'react'
import {
  billPaymentInputSchema,
  localBillDate,
  paymentMethodLabels,
  type BillPayment,
  type BillPaymentInput,
  type BillPeriodView,
} from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { FormField, MoneyField, Select } from '../../../components/ui/FormField'
import { formatMoney } from '../../../lib/money'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'

export function BillPaymentForm({
  period,
  payment,
  save,
  close,
}: {
  period: BillPeriodView
  payment?: BillPayment
  save: (input: BillPaymentInput) => Promise<void>
  close: () => void
}) {
  const key = useRef(crypto.randomUUID())
  const [amount, setAmount] = useState<number | null>(payment?.amountCents ?? null),
    [date, setDate] = useState(payment?.paymentDate ?? localBillDate())
  const [method, setMethod] = useState<BillPaymentInput['method']>(
      payment?.method ?? 'bank_transfer',
    ),
    [notes, setNotes] = useState(payment?.notes ?? '')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal title={payment ? 'Correct payment' : 'Record payment'} onClose={close}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy) return
          setBusy(true)
          try {
            await save(
              billPaymentInputSchema.parse({
                idempotencyKey: key.current,
                amountCents: amount,
                paymentDate: date,
                method,
                notes: notes || null,
              }),
            )
            close()
          } catch (failure) {
            setError(errorMessage(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="rounded-lg border border-white/10 p-3 text-sm text-slate-400">
          <p>Period due {period.dueDate}</p>
          <p>Budget estimate: {formatMoney(period.estimatedAmountCents)}</p>
          <p>Actual bill: {formatMoney(period.amountCents)}</p>
          <p>Remaining: {formatMoney(period.remainingCents)}</p>
        </div>
        <MoneyField
          label="Actual payment amount ($)"
          required
          value={amount}
          onChange={setAmount}
        />
        <FormField label="Payment date">
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label="Payment method">
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value as BillPaymentInput['method'])}
          >
            {Object.entries(paymentMethodLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        {!payment && (
          <p className="text-xs text-slate-400">
            This saves a pending payment. Confirm it after saving to record money actually paid. An
            estimate is never used as a payment.
          </p>
        )}
        {period.remainingCents !== null && amount !== null && amount > period.remainingCents && (
          <p className="text-sm text-amber-200">
            This exceeds the remaining bill. The excess will appear as an overpayment.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy}>
            {busy ? 'Saving…' : payment ? 'Save correction' : 'Save pending payment'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
