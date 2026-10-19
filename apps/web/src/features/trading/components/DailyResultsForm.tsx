import { useState } from 'react'
import { tradingResultBatchSchema, type TradingAccount } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField } from '../../../components/financial/EntryFields'
import { FormField } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { readMoney, text, optionalText } from '../../../lib/financial-entry'
import { AccountSelectionToolbar } from './AccountSelectionToolbar'

export function DailyResultsForm({
  accounts,
  save,
  close,
}: {
  accounts: TradingAccount[]
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  return (
    <FinancialEditor
      title="Record daily results"
      submitLabel={`Save ${selected.length} daily results`}
      save={save}
      close={close}
      build={(data) =>
        tradingResultBatchSchema.parse(
          selected.map((accountId) => ({
            accountId,
            sessionAt: new Date(text(data, 'sessionAt')).toISOString(),
            grossCents: readMoney(data, 'gross:' + accountId, true),
            feesCents: readMoney(data, 'fees:' + accountId, true),
            tradeCount:
              optionalText(data, 'trades:' + accountId) === null
                ? null
                : Number(text(data, 'trades:' + accountId)),
            notes: optionalText(data, 'notes'),
          })),
        )
      }
    >
      <p className="text-xs text-slate-400">
        Record one actual daily summary per selected account. Enter each account's result and fees
        separately, including losses or zero. Existing manual or copied results for that session
        cannot be recorded again.
      </p>
      <FormField label="Session timestamp (your device time)">
        <Input name="sessionAt" type="datetime-local" required />
      </FormField>
      <AccountSelectionToolbar accounts={accounts} selected={selected} onChange={setSelected} />
      {accounts.map((account) => (
        <section key={account.id} className="space-y-3 rounded-xl border border-white/10 p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(account.id)}
              onChange={(e) =>
                setSelected((ids) =>
                  e.target.checked ? [...ids, account.id] : ids.filter((id) => id !== account.id),
                )
              }
            />
            {account.nickname}
          </label>
          {selected.includes(account.id) && (
            <>
              <p className="text-xs text-slate-500">
                {account.timezone} / session starts {account.sessionStart}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <AmountField
                  label={`${account.nickname} gross realized P&L ($)`}
                  name={'gross:' + account.id}
                  required
                />
                <AmountField
                  label={`${account.nickname} fees ($)`}
                  name={'fees:' + account.id}
                  required
                />
                <FormField label={`${account.nickname} number of trades (optional)`}>
                  <Input name={'trades:' + account.id} type="number" min="0" />
                </FormField>
              </div>
            </>
          )}
        </section>
      ))}
      <FormField label="Trading notes">
        <Input name="notes" maxLength={4000} />
      </FormField>
    </FinancialEditor>
  )
}
