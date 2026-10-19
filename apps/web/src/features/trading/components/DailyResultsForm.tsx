import { useState } from 'react'
import { tradingResultBatchSchema, type TradingAccount } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { Button } from '../../../components/ui'
import { ProfitLossFields } from './ProfitLossFields'
import { resultAmounts, emptyAmounts, type ResultAmounts } from '../lib/result-amounts'
import { FormField } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { text, optionalText } from '../../../lib/financial-entry'
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
  const [common, setCommon] = useState<ResultAmounts>(emptyAmounts)
  const [amounts, setAmounts] = useState<Record<string, ResultAmounts>>({})
  return (
    <FinancialEditor
      title="Record daily results"
      submitLabel={`Save ${selected.length} daily result${selected.length === 1 ? '' : 's'}`}
      save={save}
      close={close}
      build={(data) =>
        tradingResultBatchSchema.parse(
          selected.map((accountId) => ({
            accountId,
            sessionAt: new Date(text(data, 'sessionAt')).toISOString(),
            ...resultAmounts(amounts[accountId] ?? emptyAmounts),
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
      <section className="space-y-3 rounded-xl border border-white/10 p-4">
        <h2 className="text-sm font-semibold">Enter once for selected accounts</h2>
        <ProfitLossFields value={common} onChange={setCommon} required={false} label="Shared " />
        <Button
          type="button"
          disabled={!selected.length}
          onClick={() =>
            setAmounts((current) => ({
              ...current,
              ...Object.fromEntries(selected.map((id) => [id, { ...common }])),
            }))
          }
        >
          Apply to selected accounts
        </Button>
        <p className="text-xs text-slate-400">
          Review each account below. Applying values does not save them.
        </p>
      </section>
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
                <div className="sm:col-span-2">
                  <ProfitLossFields
                    label={`${account.nickname} `}
                    value={amounts[account.id] ?? emptyAmounts}
                    onChange={(value) =>
                      setAmounts((current) => ({ ...current, [account.id]: value }))
                    }
                  />
                </div>
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
