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
import { DailyResultDateFields } from './DailyResultDateFields'
import { dailyResultDate, reportedNetAmounts } from '../lib/daily-result-entry'

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
  const [reported, setReported] = useState(false),
    [netOnly, setNetOnly] = useState(false)
  const [commonNet, setCommonNet] = useState(''),
    [nets, setNets] = useState<Record<string, string>>({})
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
            ...dailyResultDate(data, reported),
            ...(netOnly
              ? reportedNetAmounts(nets[accountId] ?? '')
              : resultAmounts(amounts[accountId] ?? emptyAmounts)),
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
      <DailyResultDateFields reported={reported} onChange={setReported} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={netOnly} onChange={(e) => setNetOnly(e.target.checked)} />
        Only fee-adjusted net result is known
      </label>
      {netOnly && (
        <p className="text-xs text-slate-400">
          Record the signed net result exactly as reported. Gross profit/loss breakdowns stay
          unknown; no fees are deducted again.
        </p>
      )}
      <AccountSelectionToolbar accounts={accounts} selected={selected} onChange={setSelected} />
      <section className="space-y-3 rounded-xl border border-white/10 p-4">
        <h2 className="text-sm font-semibold">Enter once for selected accounts</h2>
        {netOnly ? (
          <FormField label="Shared net result ($, fees included)">
            <Input
              value={commonNet}
              onChange={(e) => setCommonNet(e.target.value)}
              inputMode="decimal"
            />
          </FormField>
        ) : (
          <ProfitLossFields value={common} onChange={setCommon} required={false} label="Shared " />
        )}
        <Button
          type="button"
          disabled={!selected.length}
          onClick={() => {
            setNets((current) => ({
              ...current,
              ...Object.fromEntries(selected.map((id) => [id, commonNet])),
            }))
            setAmounts((current) => ({
              ...current,
              ...Object.fromEntries(selected.map((id) => [id, { ...common }])),
            }))
          }}
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
                  {netOnly ? (
                    <FormField label={`${account.nickname} net result ($, fees included)`}>
                      <Input
                        value={nets[account.id] ?? ''}
                        onChange={(e) =>
                          setNets((rows) => ({ ...rows, [account.id]: e.target.value }))
                        }
                        required
                        inputMode="decimal"
                      />
                    </FormField>
                  ) : (
                    <ProfitLossFields
                      label={`${account.nickname} `}
                      value={amounts[account.id] ?? emptyAmounts}
                      onChange={(value) =>
                        setAmounts((current) => ({ ...current, [account.id]: value }))
                      }
                    />
                  )}
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
