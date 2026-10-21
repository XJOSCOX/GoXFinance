import { useState } from 'react'
import {
  tradingPayoutSchema,
  localBillDate,
  type TradingAccount,
  type TradingPayout,
  type IncomeData,
} from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { readMoney, text, optionalText, moneyText } from '../../../lib/financial-entry'
import { PayoutSplitEstimate } from './PayoutSplitEstimate'
import { FormField, Select } from '../../../components/ui/FormField'
import { Input, Button } from '../../../components/ui'
import { TradingAccountSelect } from './TradingAccountSelect'
export function PayoutForm({
  payout,
  accounts,
  income,
  save,
  close,
  onBatch,
}: {
  payout?: TradingPayout
  accounts: TradingAccount[]
  income: IncomeData | null
  save: (body: unknown) => Promise<void>
  close: () => void
  onBatch?: () => void
}) {
  const [id, setId] = useState(payout?.accountId ?? accounts[0]?.id ?? ''),
    [status, setStatus] = useState(payout?.status ?? 'requested')
  const [requestAmount, setRequestAmount] = useState(moneyText(payout?.requestedCents)),
    [approvedAmount, setApprovedAmount] = useState(moneyText(payout?.approvedCents)),
    [requestDate, setRequestDate] = useState(payout?.requestDate ?? localBillDate())
  return (
    <FinancialEditor
      title={payout ? 'Update payout' : 'Record external payout request'}
      record={payout}
      save={save}
      close={close}
      build={(data) =>
        tradingPayoutSchema.parse({
          accountId: id,
          requestedCents: readMoney(data, 'requestedCents', true),
          requestDate: text(data, 'requestDate'),
          status,
          approvedCents: readMoney(data, 'approvedCents'),
          receivedCents: status === 'paid' ? readMoney(data, 'receivedCents', true) : null,
          depositDate: status === 'paid' ? text(data, 'depositDate') : null,
          reference: optionalText(data, 'reference'),
          notes: optionalText(data, 'notes'),
          receiptConfirmed: status === 'paid' && data.get('receiptConfirmed') === 'on',
          existingIncomeTransactionId:
            status === 'paid'
              ? (payout?.existingIncomeTransactionId ??
                optionalText(data, 'existingIncomeTransactionId'))
              : null,
        })
      }
    >
      {!payout && onBatch && accounts.length > 1 && (
        <Button type="button" size="small" onClick={onBatch}>
          Record for multiple accounts / Select all
        </Button>
      )}
      <p className="text-xs text-slate-400">
        This records activity you performed outside GoXFinance. It does not submit a withdrawal
        request or check provider eligibility.
      </p>
      {payout ? (
        <p>{accounts.find((a) => a.id === id)?.nickname}</p>
      ) : (
        <TradingAccountSelect accounts={accounts} value={id} onChange={setId} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <AmountField
          name="requestedCents"
          label="Requested amount ($)"
          value={payout?.requestedCents}
          onChange={setRequestAmount}
          required
        />
        <DateField
          name="requestDate"
          label="Request date"
          value={payout?.requestDate ?? localBillDate()}
          onChange={setRequestDate}
          required
        />
        <AmountField
          name="approvedCents"
          label="Approved amount ($, if known)"
          value={payout?.approvedCents}
          onChange={setApprovedAmount}
        />
        <FormField label="Payout status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {(payout?.status === 'paid'
              ? ['paid', 'cancelled']
              : ['requested', 'approved', 'rejected', 'paid', 'cancelled']
            ).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FormField>
      </div>
      <PayoutSplitEstimate
        account={accounts.find((a) => a.id === id)}
        amountText={approvedAmount || requestAmount}
        date={requestDate}
        recordedAt={payout?.createdAt}
      />
      {status === 'paid' && (
        <section className="space-y-4 rounded-xl border border-white/10 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <AmountField
              name="receivedCents"
              label="Actual net amount received ($)"
              value={payout?.receivedCents}
              required
            />
            <DateField
              name="depositDate"
              label="Actual deposit date"
              value={payout?.depositDate}
              required
            />
          </div>
          {!payout?.incomeTransactionId && (
            <FormField label="Income integration">
              <Select
                name="existingIncomeTransactionId"
                defaultValue={payout?.existingIncomeTransactionId ?? ''}
              >
                <option value="">Create one confirmed deposit in Income</option>
                {income?.transactions
                  .filter(
                    (t) => t.status === 'confirmed' && t.incomeTypeSnapshot === 'trading_payout',
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      Link deposit {t.depositDate} / {t.reference ?? t.id.slice(0, 8)}
                    </option>
                  ))}
              </Select>
            </FormField>
          )}
          {payout?.incomeTransactionId && (
            <p className="text-xs text-slate-400">
              Corrections update the existing income deposit.
            </p>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="receiptConfirmed"
              required
              defaultChecked={payout?.receiptConfirmed}
            />
            I confirm these funds were actually received.
          </label>
        </section>
      )}
      <FormField label="External payout reference">
        <Input name="reference" defaultValue={payout?.reference ?? ''} />
      </FormField>
      <FormField label="Notes (splits, fees or adjustments)">
        <Input
          placeholder="Add optional details or context"
          name="notes"
          defaultValue={payout?.notes ?? ''}
        />
      </FormField>
    </FinancialEditor>
  )
}
