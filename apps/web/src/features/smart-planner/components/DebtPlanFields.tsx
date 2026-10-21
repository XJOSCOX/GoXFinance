import { useState } from 'react'
import { localBillDate, type ForecastSources, type DebtPaymentPlan } from '@goxfinance/shared'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { FormField, Select } from '../../../components/ui/FormField'
import { formatMoney } from '../../../lib/money'
export function DebtPlanFields({
  sources: s,
  value: v,
}: {
  sources: ForecastSources
  value?: DebtPaymentPlan
}) {
  const [debtId, setDebt] = useState(v?.target.id ?? ''),
    [mode, setMode] = useState(v?.mode ?? 'pay_by_date'),
    [basis, setBasis] = useState(v?.amountBasis ?? 'balance'),
    [offerId, setOffer] = useState(v?.settlementId ?? '')
  const debt = s.debts.find((d) => d.id === debtId),
    offer = s.offers.find((o) => o.id === offerId && o.debtId === debtId)
  const bills = s.bills.filter((b) => b.linkedDebtId === debtId && b.status === 'active')
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Debt to plan">
          <Select
            name="target"
            value={debtId ? 'debt:' + debtId : ''}
            required
            onChange={(e) => {
              setDebt(e.target.value.slice(5))
              setOffer('')
            }}
          >
            <option value="">Select debt</option>
            {s.debts
              .filter((d) => !d.isArchived)
              .map((d) => (
                <option key={d.id} value={'debt:' + d.id}>
                  {d.accountNickname || d.creditorName}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField label="Payment plan">
          <Select name="mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="pay_by_date">Pay a confirmed amount by a date</option>
            <option value="linked_bill">Use an existing monthly bill</option>
          </Select>
        </FormField>
      </div>
      <p className="text-sm text-slate-400">
        Recorded debt balance: <strong>{formatMoney(debt?.currentBalanceCents ?? null)}</strong>.
        This plan never changes that balance or marks the debt paid.
      </p>
      {mode === 'pay_by_date' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Planned amount basis">
            <Select
              name="amountBasis"
              value={basis}
              onChange={(e) => setBasis(e.target.value as typeof basis)}
            >
              <option value="balance">Recorded balance, reviewed by me</option>
              <option value="settlement">Existing settlement offer</option>
              <option value="custom">Another amount I intend to pay</option>
            </Select>
          </FormField>
          {basis === 'settlement' && (
            <FormField label="Settlement offer">
              <Select
                name="settlementId"
                value={offerId}
                required
                onChange={(e) => setOffer(e.target.value)}
              >
                <option value="">Select recorded offer</option>
                {s.offers
                  .filter((o) => o.debtId === debtId)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {formatMoney(o.amountCents)} · {o.status}
                    </option>
                  ))}
              </Select>
            </FormField>
          )}
          <AmountField
            key={debtId + basis + offerId}
            name="debtPlanAmount"
            label="Total to pay during this goal (USD)"
            value={
              offer?.amountCents ??
              (v?.target.id === debtId ? v.amountCents : debt?.currentBalanceCents)
            }
          />
          {basis === 'settlement' && (
            <p className="text-xs text-amber-200">
              An offered amount is a personal target until accepted. Record or update offers in Debt
              planning; an offer alone does not replace creditor terms.
            </p>
          )}
        </div>
      ) : (
        <FormField label="Existing debt-linked bill">
          <Select name="billId" required defaultValue={v?.billId ?? ''}>
            <option value="">Select monthly obligation</option>
            {bills.map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </FormField>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          key={'start' + offerId}
          name="planStart"
          label="Plan starts / count payments from"
          value={offer?.offerDate ?? v?.startDate ?? localBillDate()}
          required
        />
        <DateField
          name="planDeadline"
          label={mode === 'pay_by_date' ? 'Pay by date' : 'Use monthly terms through'}
          value={v?.deadline}
          required
        />
      </div>
      <p className="text-xs text-slate-400">
        The target includes completed debt payments from the start date through the deadline.
        Existing bill/debt payments count once; only the additional amount needed is added to the
        plan.
      </p>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" name="replaceOriginal" defaultChecked={v?.replaceOriginal} />
        <span>
          The provider confirmed this schedule replaces the prior minimum or past-due schedule for
          these dates. Evidence is required. This does not forgive the recorded balance.
        </span>
      </label>
      <FormField label="Plan confirmation">
        <Select name="planStatus" defaultValue={v?.status ?? 'draft'}>
          <option value="draft">Draft — excluded from Smart Planner</option>
          <option value="confirmed">
            Confirm reviewed amount and schedule — include in Smart Planner
          </option>
          <option value="cancelled">Cancel this plan</option>
        </Select>
      </FormField>
    </div>
  )
}
