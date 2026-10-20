import { useState } from 'react'
import type { BankReviewOptions } from '@goxfinance/shared'
import { FormField, Select } from '../../../../components/ui/FormField'
import { AmountField } from '../../../../components/financial/EntryFields'
import { formatMoney } from '../../../../lib/money'
function BreakdownFields() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <AmountField label="Principal (if known)" name="principal" />
      <AmountField label="Interest (if known)" name="interest" />
      <AmountField label="Fees (if known)" name="fees" />
    </div>
  )
}
export function DebtReviewFields({ data }: { data: BankReviewOptions }) {
  const linked = data.payments.find((p) => p.id === data.existingLink?.id),
    [debt, setDebt] = useState(linked?.debtId ?? ''),
    [payment, setPayment] = useState(linked?.id ?? '')
  return (
    <>
      <FormField label="Debt">
        <Select
          name="debtId"
          required
          value={debt}
          onChange={(e) => {
            setDebt(e.target.value)
            setPayment('')
          }}
        >
          <option value="">Choose debt</option>
          {data.debts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.creditorName} · {formatMoney(d.currentBalanceCents)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Payment">
        <Select name="paymentId" value={payment} onChange={(e) => setPayment(e.target.value)}>
          <option value="">Record one completed payment</option>
          {data.payments
            .filter((p) => p.debtId === debt && p.paymentStatus === 'completed')
            .map((p) => (
              <option key={p.id} value={p.id}>
                Link {formatMoney(p.amountCents)} · {p.paymentDate}
              </option>
            ))}
        </Select>
      </FormField>
      {!payment && <BreakdownFields />}
      <p className="text-xs text-amber-200">
        A full-balance payment does not close or settle the debt. Unknown principal stays unknown;
        confirm a final payoff amount with the creditor.
      </p>
    </>
  )
}
export function BillReviewFields({ data }: { data: BankReviewOptions }) {
  const linked = data.bills
      .flatMap((b) => b.payments)
      .find((p) => p.id === data.existingLink?.id || p.debtPaymentId === data.existingLink?.id),
    [billId, setBill] = useState(linked?.billId ?? ''),
    [periodId, setPeriod] = useState(linked?.periodId ?? ''),
    [payment, setPayment] = useState(linked?.id ?? ''),
    [confirm, setConfirm] = useState(false),
    bill = data.bills.find((b) => b.id === billId),
    period = bill?.periods.find((p) => p.id === periodId)
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Bill">
          <Select
            name="billId"
            required
            value={billId}
            onChange={(e) => {
              setBill(e.target.value)
              setPeriod('')
              setPayment('')
            }}
          >
            <option value="">Choose bill</option>
            {data.bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Billing period">
          <Select
            name="periodId"
            required
            value={periodId}
            onChange={(e) => {
              setPeriod(e.target.value)
              setPayment('')
            }}
          >
            <option value="">Choose period</option>
            {bill?.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.dueDate} · actual {formatMoney(p.amountCents)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      {period && (
        <p className="rounded-lg bg-white/5 p-3 text-sm">
          Budget estimate {formatMoney(period.budgetEstimateCents ?? period.estimatedAmountCents)} ·
          Actual billed {formatMoney(period.amountCents)} · Still owed{' '}
          {formatMoney(period.remainingCents)}
        </p>
      )}
      <FormField label="Payment">
        <Select name="paymentId" value={payment} onChange={(e) => setPayment(e.target.value)}>
          <option value="">Record one completed payment</option>
          {bill?.payments
            .filter((p) => p.periodId === periodId && p.status === 'completed')
            .map((p) => (
              <option key={p.id} value={p.id}>
                Link {formatMoney(p.amountCents)} · {p.paymentDate}
              </option>
            ))}
        </Select>
      </FormField>
      {!payment && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              name="confirmBilledAmount"
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            Also confirm the actual billed amount
          </label>
          {confirm && (
            <AmountField
              key={periodId}
              label="Actual billed amount (not the payment)"
              name="billedAmount"
              value={period?.amountCents}
              required
            />
          )}
          <BreakdownFields />
        </>
      )}
      <p className="text-xs text-slate-400">
        A bill linked to a debt uses one authoritative debt payment. The saved estimate remains
        separate.
      </p>
    </>
  )
}
