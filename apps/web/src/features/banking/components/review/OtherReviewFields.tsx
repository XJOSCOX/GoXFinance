import { useState } from 'react'
import type { BankReviewOptions } from '@goxfinance/shared'
import { FormField, Select } from '../../../../components/ui/FormField'
import { AmountField } from '../../../../components/financial/EntryFields'
import { Input } from '../../../../components/ui'
import { formatMoney } from '../../../../lib/money'
import { AllocationFields } from './AllocationFields'
export function IncomeReviewFields({ data }: { data: BankReviewOptions }) {
  const linked = data.income.transactions.find((t) => t.id === data.existingLink?.id),
    [source, setSource] = useState(linked?.sourceId ?? ''),
    [transaction, setTransaction] = useState(
      linked?.status === 'cancelled' ? '' : (linked?.id ?? ''),
    ),
    old = data.income.transactions.find((t) => t.id === transaction)
  return (
    <>
      <FormField label="Income source">
        <Select
          name="sourceId"
          required
          value={source}
          onChange={(e) => {
            setSource(e.target.value)
            setTransaction('')
          }}
        >
          <option value="">Choose existing source</option>
          {data.income.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Paycheck / deposit">
        <Select
          name="transactionId"
          value={transaction}
          onChange={(e) => setTransaction(e.target.value)}
        >
          <option value="">Create a confirmed deposit</option>
          {data.income.transactions
            .filter((t) => t.sourceId === source && t.status !== 'cancelled')
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.payDate} · {t.status} · {formatMoney(t.actualNetCents ?? t.expectedNetCents)}
              </option>
            ))}
        </Select>
      </FormField>
      {old?.status !== 'confirmed' && (
        <>
          <div key={transaction} className="grid gap-4 sm:grid-cols-2">
            <AmountField
              label="Actual gross (if known)"
              name="gross"
              value={old?.actualGrossCents}
            />
            <AmountField
              label="Deductions (if known)"
              name="deductions"
              value={old?.deductionsCents}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="receiptConfirmed" required />I confirm this posted amount
            is the actual net deposit received.
          </label>
        </>
      )}
      <p className="text-xs text-slate-400">
        Gross earnings remain separate from net deposited cash. Trading deposits must first use the
        existing payout workflow.
      </p>
    </>
  )
}
export function TransferReviewFields({ data }: { data: BankReviewOptions }) {
  return (
    <>
      <FormField label="Other leg">
        <Select name="counterpartId" defaultValue="">
          <option value="">Not found — keep visibly unmatched</option>
          {data.counterpartTransactions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.date} · {t.description} · {formatMoney(t.amountCents)}
            </option>
          ))}
        </Select>
      </FormField>
      <p className="text-xs text-slate-400">
        Internal transfer tracking only. No new income or purchase spending, and no real funds are
        moved.
      </p>
    </>
  )
}
export function RefundReviewFields({ data }: { data: BankReviewOptions }) {
  const [type, setType] = useState(data.refund?.originalType ?? 'expense'),
    [original, setOriginal] = useState(data.refund?.originalId ?? ''),
    billPayment = data.bills.flatMap((b) => b.payments).find((p) => p.id === original),
    expense = data.expenses.find((e) => e.id === original),
    billPeriod = data.bills.flatMap((b) => b.periods).find((p) => p.id === billPayment?.periodId),
    categoryIds =
      type === 'expense'
        ? expense?.allocations.map((v) => v.categoryId)
        : billPeriod?.categoryId
          ? [billPeriod.categoryId]
          : undefined,
    debtRefund =
      type === 'debt_payment' || (type === 'bill_payment' && !!billPayment?.debtPaymentId),
    records =
      type === 'expense'
        ? data.expenses
            .filter((e) => !e.voided)
            .map((e) => ({
              id: e.id,
              label: e.description,
              amount: e.amountCents,
              date: e.transactionDate,
            }))
        : type === 'debt_payment'
          ? data.payments
              .filter((p) => p.paymentStatus === 'completed')
              .map((p) => ({
                id: p.id,
                label: data.debts.find((d) => d.id === p.debtId)?.creditorName ?? 'Debt payment',
                amount: p.amountCents,
                date: p.paymentDate,
              }))
          : data.bills.flatMap((b) =>
              b.payments
                .filter((p) => p.status === 'completed')
                .map((p) => ({
                  id: p.id,
                  label: b.name,
                  amount: p.amountCents,
                  date: p.paymentDate,
                })),
            )
  return (
    <>
      <FormField label="Original record type">
        <Select
          name="originalType"
          value={type}
          onChange={(e) => {
            setType(e.target.value as typeof type)
            setOriginal('')
          }}
        >
          <option value="expense">Expense</option>
          <option value="bill_payment">Bill payment</option>
          <option value="debt_payment">Debt payment</option>
        </Select>
      </FormField>
      <FormField label="Original transaction">
        <Select
          name="originalId"
          required
          value={original}
          onChange={(e) => setOriginal(e.target.value)}
        >
          <option value="">Choose original transaction</option>
          {records.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} · {formatMoney(r.amount)} · {r.date}
            </option>
          ))}
        </Select>
      </FormField>
      {!debtRefund && (
        <AllocationFields
          key={type + original}
          categories={data.categories
            .filter((c) => !categoryIds || categoryIds.includes(c.id))
            .map((c) => ({ ...c, archived: false }))}
          amount={data.transaction.amountCents}
          initial={data.refund?.allocations}
        />
      )}
      <p className="text-xs text-slate-400">
        An explicit refund adjustment preserves the original record. It reduces net spending/cash
        paid and never creates income or assumes a principal change.
      </p>
    </>
  )
}
export function IgnoreReviewFields() {
  return (
    <FormField label="Reason for excluding">
      <Input
        name="reason"
        required
        maxLength={500}
        placeholder="Why this should stay outside accounting"
      />
    </FormField>
  )
}
