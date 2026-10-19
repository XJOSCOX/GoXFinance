import { useRef, useState } from 'react'
import {
  billPaymentInputSchema,
  billPaymentOptions,
  debtPaymentStatusLabels,
  localBillDate,
  paymentMethodLabels,
  type BillPayment,
  type BillPaymentInput,
  type BillPeriodView,
} from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { formatMoney } from '../../../lib/money'
import { moneyText, parseMoney } from '../../../lib/payment-money'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'
import { PaymentAmountSelector } from '../../../components/payments/PaymentAmountSelector'
import {
  PaymentBreakdown,
  type PaymentBreakdownText,
} from '../../../components/payments/PaymentBreakdown'
import { PaymentConfirmation } from '../../../components/payments/PaymentConfirmation'

export function BillPaymentForm({
  period,
  payment,
  save,
  close,
  allowCompleted = true,
}: {
  period: BillPeriodView
  payment?: BillPayment
  save: (input: BillPaymentInput) => Promise<void>
  close: () => void
  allowCompleted?: boolean
}) {
  const key = useRef(crypto.randomUUID())
  const [amount, setAmount] = useState(moneyText(payment?.amountCents)),
    [date, setDate] = useState(payment?.paymentDate ?? localBillDate())
  const [selected, setSelected] = useState('custom'),
    [status, setStatus] = useState<BillPayment['status']>(payment?.status ?? 'pending')
  const [method, setMethod] = useState<BillPaymentInput['method']>(
      payment?.method ?? 'bank_transfer',
    ),
    [notes, setNotes] = useState(payment?.notes ?? '')
  const [breakdown, setBreakdown] = useState<PaymentBreakdownText>({
    principal: moneyText(payment?.principalAmountCents),
    interest: moneyText(payment?.interestAmountCents),
    fees: moneyText(payment?.feesAmountCents),
    reference: payment?.referenceNumber ?? '',
  })
  const [cleared, setCleared] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const statuses =
    payment?.status === 'completed'
      ? ['completed']
      : payment || !allowCompleted
        ? ['scheduled', 'pending', 'failed']
        : ['scheduled', 'pending', 'completed', 'failed']
  return (
    <Modal
      title={payment ? 'Correct payment' : 'Record payment'}
      onClose={close}
      framed
      className="max-w-2xl"
    >
      <form
        className="flex min-h-0 flex-col"
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          setError('')
          try {
            if (status === 'completed' && !cleared)
              throw new Error('Confirm that the payment has actually cleared')
            await save(
              billPaymentInputSchema.parse({
                idempotencyKey: key.current,
                amountCents: parseMoney(amount, true),
                paymentDate: date,
                method,
                notes: notes.trim() || null,
                status,
                principalAmountCents: parseMoney(breakdown.principal),
                interestAmountCents: parseMoney(breakdown.interest),
                feesAmountCents: parseMoney(breakdown.fees),
                referenceNumber: breakdown.reference.trim() || null,
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
        <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-7">
          <div className="rounded-lg border border-white/10 p-3 text-sm text-slate-400">
            <p>Period due {period.dueDate}</p>
            <p>Budget estimate: {formatMoney(period.estimatedAmountCents)}</p>
            <p>Actual bill: {formatMoney(period.amountCents)}</p>
            <p>Remaining: {formatMoney(period.remainingCents)}</p>
          </div>
          <PaymentAmountSelector
            options={billPaymentOptions(period)}
            selected={selected}
            onSelect={(option) => {
              setSelected(option.id)
              if (option.id !== 'custom') setAmount(moneyText(option.amountCents))
              setCleared(false)
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Actual payment amount ($)">
              <Input
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setCleared(false)
                }}
                placeholder="Enter actual amount"
              />
            </FormField>
            <FormField label="Payment date">
              <Input
                required
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  setCleared(false)
                }}
              />
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
            <FormField label="Payment status">
              <Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as BillPayment['status'])
                  setCleared(false)
                }}
              >
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {debtPaymentStatusLabels[value as BillPayment['status']]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          {!allowCompleted && !payment && (
            <p className="text-xs text-amber-200">
              Save a pending payment, then request Owner confirmation before it counts as paid.
            </p>
          )}
          <PaymentBreakdown value={breakdown} onChange={setBreakdown} />
          <FormField label="Notes">
            <Input maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <PaymentConfirmation
            amount={amount}
            status={status}
            confirmed={cleared}
            onChange={setCleared}
          />
          {period.remainingCents !== null && Number(amount) * 100 > period.remainingCents && (
            <p className="text-sm text-amber-200">
              This exceeds the remaining bill. The excess will appear as an overpayment.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/10 p-4">
          <Button type="button" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy}>
            {busy
              ? 'Saving...'
              : payment
                ? 'Save correction'
                : status === 'pending'
                  ? 'Save pending payment'
                  : 'Save payment'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
