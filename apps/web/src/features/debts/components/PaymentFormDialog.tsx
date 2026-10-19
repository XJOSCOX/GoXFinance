import { useState } from 'react'
import {
  createDebtPaymentSchema,
  debtPaymentOptions,
  debtPaymentStatusLabels,
  localBillDate,
  paymentMethodLabels,
  type Debt,
  type DebtPayment,
  type DebtPaymentInput,
} from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'
import { moneyText, parseMoney } from '../../../lib/payment-money'
import { PaymentAmountSelector } from '../../../components/payments/PaymentAmountSelector'
import {
  PaymentBreakdown,
  type PaymentBreakdownText,
} from '../../../components/payments/PaymentBreakdown'
import { PaymentConfirmation } from '../../../components/payments/PaymentConfirmation'

export function PaymentFormDialog({
  debt,
  payment,
  onClose,
  onSave,
  requestMode = false,
  allowCompleted = true,
}: {
  debt?: Debt
  payment?: DebtPayment | null
  onClose: () => void
  onSave: (input: DebtPaymentInput, reason?: string) => Promise<void>
  requestMode?: boolean
  allowCompleted?: boolean
}) {
  const [amount, setAmount] = useState(moneyText(payment?.amountCents)),
    [selected, setSelected] = useState('custom')
  const [breakdown, setBreakdown] = useState<PaymentBreakdownText>({
    principal: moneyText(payment?.principalAmountCents),
    interest: moneyText(payment?.interestAmountCents),
    fees: moneyText(payment?.feesAmountCents),
    reference: payment?.referenceNumber ?? '',
  })
  const [date, setDate] = useState(payment?.paymentDate ?? localBillDate()),
    [status, setStatus] = useState<DebtPaymentInput['paymentStatus']>(
      payment?.paymentStatus ?? 'pending',
    )
  const [method, setMethod] = useState<DebtPaymentInput['paymentMethod']>(
      payment?.paymentMethod ?? 'bank_transfer',
    ),
    [notes, setNotes] = useState(payment?.notes ?? '')
  const [reason, setReason] = useState(''),
    [key] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [cleared, setCleared] = useState(false)
  const statuses =
    payment?.paymentStatus === 'completed'
      ? ['completed']
      : payment || !allowCompleted
        ? ['scheduled', 'pending', 'failed']
        : ['scheduled', 'pending', 'completed', 'failed']
  return (
    <Modal
      title={payment ? 'Edit payment' : 'Record payment'}
      onClose={onClose}
      framed
      className="max-w-2xl"
    >
      <form
        className="flex min-h-0 flex-col"
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          try {
            if (status === 'completed' && !cleared)
              throw new Error('Confirm that the payment has actually cleared')
            const input = createDebtPaymentSchema.parse({
              idempotencyKey: key,
              amountCents: parseMoney(amount, true),
              paymentDate: date,
              paymentStatus: status,
              paymentMethod: method,
              principalAmountCents: parseMoney(breakdown.principal),
              interestAmountCents: parseMoney(breakdown.interest),
              feesAmountCents: parseMoney(breakdown.fees),
              referenceNumber: breakdown.reference.trim() || null,
              notes: notes.trim() || null,
            })
            setError('')
            setBusy(true)
            await onSave(input, reason.trim())
            onClose()
          } catch (failure) {
            setError(errorMessage(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-7">
          {debt && (
            <PaymentAmountSelector
              options={debtPaymentOptions(debt)}
              selected={selected}
              onSelect={(option) => {
                setSelected(option.id)
                if (option.id !== 'custom') setAmount(moneyText(option.amountCents))
                setCleared(false)
              }}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Amount *">
              <Input
                inputMode="decimal"
                required
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value)
                  setCleared(false)
                }}
                placeholder="Enter amount"
              />
            </FormField>
            <FormField label="Payment date *">
              <Input
                type="date"
                required
                value={date}
                onChange={(event) => {
                  setDate(event.target.value)
                  setCleared(false)
                }}
              />
            </FormField>
            <FormField label="Status">
              <Select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as DebtPaymentInput['paymentStatus'])
                  setCleared(false)
                }}
              >
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {debtPaymentStatusLabels[value as keyof typeof debtPaymentStatusLabels]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Method">
              <Select
                value={method}
                onChange={(event) =>
                  setMethod(event.target.value as DebtPaymentInput['paymentMethod'])
                }
              >
                {Object.entries(paymentMethodLabels).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          {!allowCompleted && !payment && (
            <p className="text-xs text-amber-200">
              Save an unconfirmed payment and request Owner confirmation.
            </p>
          )}
          <PaymentBreakdown value={breakdown} onChange={setBreakdown} />
          <FormField label="Notes">
            <Input
              maxLength={4000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </FormField>
          {requestMode && (
            <FormField label="Reason for Owner approval *">
              <Input
                required
                maxLength={2000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </FormField>
          )}
          <PaymentConfirmation
            amount={amount}
            status={status ?? 'pending'}
            confirmed={cleared}
            onChange={setCleared}
          />
          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/10 p-4">
          <Button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving...' : requestMode ? 'Request approval' : 'Save payment'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
