import { useRef, useState } from 'react'
import {
  billPaymentInputSchema,
  billPaymentOptions,
  debtPaymentStatusLabels,
  localBillDate,
  paymentMethodLabels,
  billCarryForward,
  billMonthlyCents,
  type BillView,
  type BillPayment,
  type BillPaymentInput,
  type BillPeriodView,
} from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { moneyText, parseMoney } from '../../../lib/payment-money'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'
import { PaymentAmountSelector } from '../../../components/payments/PaymentAmountSelector'
import {
  PaymentBreakdown,
  type PaymentBreakdownText,
} from '../../../components/payments/PaymentBreakdown'
import { BillAmountSummary } from './BillAmountSummary'
import { PaymentConfirmation } from '../../../components/payments/PaymentConfirmation'
import { formatMoney } from '../../../lib/money'

export function BillPaymentForm({
  period,
  payment,
  save,
  close,
  allowCompleted = true,
  billRevision,
  bill,
  selectPeriod,
}: {
  period: BillPeriodView
  payment?: BillPayment
  save: (input: BillPaymentInput) => Promise<void>
  close: () => void
  allowCompleted?: boolean
  billRevision?: number
  bill?: BillView
  selectPeriod?: (id: string) => void
}) {
  const [confirmBill, setConfirmBill] = useState(false)
  const [billedAmount, setBilledAmount] = useState(moneyText(period.amountCents))
  let actualAmount = period.amountCents
  if (confirmBill) {
    try {
      actualAmount = parseMoney(billedAmount)
    } catch {
      actualAmount = null
    }
  }
  const reviewedPeriod = {
    ...period,
    amountCents: actualAmount,
    remainingCents: !confirmBill
      ? period.remainingCents
      : actualAmount === null
        ? null
        : Math.max(0, actualAmount - (period.paidCents ?? 0) - (period.creditCents ?? 0)),
  }
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
  const today = localBillDate(),
    carry = bill ? billCarryForward(bill, today) : null
  let previewPayment: number | null = null
  try {
    previewPayment = parseMoney(amount)
  } catch {
    /* Keep invalid typed input for correction. */
  }
  const afterPayment =
    actualAmount === null || previewPayment === null
      ? null
      : Math.max(
          0,
          actualAmount -
            (period.paidCents ?? 0) -
            (period.creditCents ?? 0) +
            (payment?.status === 'completed' ? payment.amountCents : 0) -
            previewPayment,
        )
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
                ...(confirmBill && !payment && billRevision !== undefined
                  ? {
                      billAmountConfirmation: {
                        amountCents: parseMoney(billedAmount, true),
                        expectedRevision: billRevision,
                      },
                    }
                  : {}),
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
          {bill && (
            <section className="space-y-3 rounded-xl border border-white/10 p-4 text-sm">
              <p>
                Usual monthly budget:{' '}
                <strong>
                  {formatMoney(
                    billMonthlyCents(
                      bill.amountType === 'variable' ? bill.estimatedAmountCents : bill.amountCents,
                      bill.frequency,
                    ),
                  )}
                </strong>
              </p>
              {carry && (
                <p>
                  Past due: <strong>{formatMoney(carry.past.amountCents)}</strong>
                  {carry.past.estimated ? ' estimated' : ''} · Next payment including carry-forward:{' '}
                  <strong>{formatMoney(carry.nextPayment.amountCents)}</strong>
                  {carry.nextPayment.estimated ? ' estimated' : ''}
                </p>
              )}
              {selectPeriod && (
                <FormField label="Apply payment to billing period">
                  <Select value={period.id} onChange={(e) => selectPeriod(e.target.value)}>
                    {[...bill.periods]
                      .filter((p) => p.paymentStatus !== 'cancelled')
                      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.dueDate}
                          {p.dueDate < today ? ' · Past due' : ' · Upcoming'} ·{' '}
                          {formatMoney(p.remainingCents)} actual remaining
                        </option>
                      ))}
                  </Select>
                </FormField>
              )}
              <p className="text-xs text-slate-400">
                Choose a period, then its full remaining balance or a partial amount below. Payments
                are recorded against that period only; other unpaid periods remain owed.
              </p>
            </section>
          )}
          <BillAmountSummary period={period} />
          {!payment && allowCompleted && billRevision !== undefined && (
            <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-[#aab9a9]"
                  checked={confirmBill}
                  onChange={(event) => setConfirmBill(event.target.checked)}
                />
                <span>
                  Confirm the actual bill total for this period
                  <span className="mt-1 block text-xs text-slate-400">
                    Use the amount on your bill, even when you are only paying part of it. Your
                    monthly estimate stays unchanged.
                  </span>
                </span>
              </label>
              {confirmBill && (
                <FormField label="Confirmed bill total ($)">
                  <Input
                    required
                    inputMode="decimal"
                    value={billedAmount}
                    placeholder="Amount on your bill"
                    onChange={(event) => {
                      setBilledAmount(event.target.value)
                      setCleared(false)
                    }}
                  />
                </FormField>
              )}
            </section>
          )}
          {period.amountCents === null && !confirmBill && (
            <p className="text-xs text-amber-200">
              You can record what you paid. The amount still owed will remain unknown until the
              actual bill total is confirmed.
            </p>
          )}
          <PaymentAmountSelector
            options={billPaymentOptions(reviewedPeriod).map((option) =>
              period.dueDate < today && option.id === 'remaining'
                ? { ...option, label: option.label + ' — full past-due balance for this period' }
                : option,
            )}
            selected={selected}
            onSelect={(option) => {
              setSelected(option.id)
              if (option.id !== 'custom') setAmount(moneyText(option.amountCents))
              setCleared(false)
            }}
          />
          {afterPayment !== null && (
            <p className="rounded-lg bg-white/[.03] p-3 text-sm">
              If this payment completes, this period will have{' '}
              <strong>{formatMoney(afterPayment)}</strong> remaining.{' '}
              {status !== 'completed'
                ? 'Pending or scheduled payments do not reduce the amount actually owed.'
                : ''}
            </p>
          )}
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
            <Input
              placeholder="Add optional details or context"
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
          <PaymentConfirmation
            amount={amount}
            status={status}
            confirmed={cleared}
            onChange={setCleared}
          />
          {reviewedPeriod.remainingCents !== null &&
            Number(amount) * 100 > reviewedPeriod.remainingCents && (
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
