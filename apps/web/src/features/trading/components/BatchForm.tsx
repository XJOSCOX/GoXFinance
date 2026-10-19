import { useState } from 'react'
import { payoutBatchSchema, localBillDate, type TradingAccount } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { DateField } from '../../../components/financial/EntryFields'
import { readMoney, text, optionalText } from '../../../lib/financial-entry'
import { Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
import { Button } from '../../../components/ui'
import { AccountSelectionToolbar } from './AccountSelectionToolbar'
import { PayoutSplitEstimate } from './PayoutSplitEstimate'
export function BatchForm({
  accounts,
  save,
  close,
}: {
  accounts: TradingAccount[]
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [commonAmount, setCommonAmount] = useState(''),
    [amounts, setAmounts] = useState<Record<string, string>>({})
  const [requestDate, setRequestDate] = useState(localBillDate())
  return (
    <FinancialEditor
      title="Record external payout batch"
      save={save}
      close={close}
      build={(data) =>
        payoutBatchSchema.parse({
          name: text(data, 'name'),
          requestDate: text(data, 'requestDate'),
          notes: optionalText(data, 'notes'),
          entries: selected.map((accountId) => ({
            accountId,
            requestedCents: readMoney(data, accountId, true),
          })),
        })
      }
    >
      <p className="text-xs text-slate-400">
        Record requests you made externally. Each account gets its own payout record and receipt
        status. This does not send requests to Topstep or create income.
      </p>
      <FormField label="Batch name">
        <Input name="name" required />
      </FormField>
      <DateField
        label="External request date"
        name="requestDate"
        value={localBillDate()}
        onChange={setRequestDate}
        required
      />
      <AccountSelectionToolbar accounts={accounts} selected={selected} onChange={setSelected} />
      <div className="flex flex-wrap items-end gap-2">
        <FormField label="Shared requested amount ($, optional)">
          <Input
            value={commonAmount}
            onChange={(e) => setCommonAmount(e.target.value)}
            inputMode="decimal"
          />
        </FormField>
        <Button
          type="button"
          size="small"
          disabled={!commonAmount || !selected.length}
          onClick={() =>
            setAmounts((previous) => ({
              ...previous,
              ...Object.fromEntries(selected.map((id) => [id, commonAmount])),
            }))
          }
        >
          Apply to selected
        </Button>
      </div>
      {accounts.map((account) => (
        <div key={account.id} className="space-y-3 rounded-xl border border-white/10 p-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(account.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, account.id]
                    : selected.filter((id) => id !== account.id),
                )
              }
            />
            {account.nickname}
          </label>
          {selected.includes(account.id) && (
            <FormField label={`${account.nickname} requested amount ($)`}>
              <Input
                name={account.id}
                value={amounts[account.id] ?? ''}
                onChange={(e) =>
                  setAmounts((previous) => ({ ...previous, [account.id]: e.target.value }))
                }
                inputMode="decimal"
                required
              />
            </FormField>
          )}
          {selected.includes(account.id) && (
            <PayoutSplitEstimate
              account={account}
              amountText={amounts[account.id] ?? ''}
              date={requestDate}
            />
          )}
        </div>
      ))}
      <FormField label="Notes">
        <Input name="notes" />
      </FormField>
    </FinancialEditor>
  )
}
