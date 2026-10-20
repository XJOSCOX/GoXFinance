import { useState } from 'react'
import { tradingResultSchema, type TradingAccount, type TradingResult } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField } from '../../../components/financial/EntryFields'
import { readMoney, text, optionalText } from '../../../lib/financial-entry'
import { FormField } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { ProfitLossFields } from './ProfitLossFields'
import { resultAmounts, type ResultAmounts } from '../lib/result-amounts'
import { moneyText } from '../../../lib/financial-entry'
import { formatMoney } from '../../../lib/money'
import { TradingAccountSelect } from './TradingAccountSelect'
export function ResultForm({
  result,
  accounts,
  save,
  close,
}: {
  result?: TradingResult
  accounts: TradingAccount[]
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const [id, setId] = useState(result?.accountId ?? accounts[0]?.id ?? '')
  const [split, setSplit] = useState(!result || result.profitCents != null)
  const [amounts, setAmounts] = useState<ResultAmounts>({
    profit: moneyText(result?.profitCents),
    loss: moneyText(result?.lossCents),
    fees: moneyText(result?.feesCents),
    feesIncluded: result?.feesIncluded ?? false,
  })
  const account = accounts.find((a) => a.id === id)
  return (
    <FinancialEditor
      title={result ? 'Correct daily result' : 'Record daily result'}
      record={result}
      save={save}
      close={close}
      build={(data) =>
        tradingResultSchema.parse({
          accountId: id,
          sessionAt: new Date(text(data, 'sessionAt')).toISOString(),
          ...(split
            ? resultAmounts(amounts)
            : {
                grossCents: readMoney(data, 'grossCents', true),
                feesCents: readMoney(data, 'feesCents', true),
                profitCents: null,
                lossCents: null,
              }),
          tradeCount:
            optionalText(data, 'tradeCount') === null ? null : Number(text(data, 'tradeCount')),
          notes: optionalText(data, 'notes'),
        })
      }
    >
      {result ? (
        <p className="text-sm">{account?.nickname}</p>
      ) : (
        <TradingAccountSelect accounts={accounts} value={id} onChange={setId} />
      )}
      {result && (
        <p className="text-sm text-slate-300">
          Saved net result: {formatMoney(result.netCents)}. Changes take effect only after saving.
        </p>
      )}
      <p className="text-xs text-slate-400">
        One summary per account/session. Correct the existing record instead of adding another. Net
        P&amp;L equals gross realized P&amp;L minus fees. Losses and zero results are supported.
      </p>
      <FormField label="Session timestamp (your device time)">
        <Input
          name="sessionAt"
          type="datetime-local"
          required
          defaultValue={
            result
              ? new Date(
                  new Date(result.sessionAt).getTime() -
                    new Date(result.sessionAt).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : ''
          }
        />
      </FormField>
      <p className="text-xs text-slate-400">
        Session grouping: {result?.timezone ?? account?.timezone}, starts at{' '}
        {result?.sessionStart ?? account?.sessionStart}. Dates identify the session's start date.
      </p>
      {result && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
          Enter separate profit and loss
        </label>
      )}
      {!split && (
        <p className="text-xs text-slate-400">
          Historical profit/loss breakdown is unknown. Keep the signed gross result or enter a
          verified breakdown.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {split ? (
          <div className="sm:col-span-2">
            <ProfitLossFields value={amounts} onChange={setAmounts} />
          </div>
        ) : (
          <>
            <AmountField
              label="Gross realized P&L ($, losses negative)"
              name="grossCents"
              value={result?.grossCents}
              required
            />
            <AmountField
              label="Commissions and fees ($)"
              name="feesCents"
              value={result?.feesCents}
              required
            />
          </>
        )}
        <FormField label="Number of trades (optional)">
          <Input name="tradeCount" type="number" min="0" defaultValue={result?.tradeCount ?? ''} />
        </FormField>
      </div>
      <FormField label="Trading notes">
        <Input name="notes" defaultValue={result?.notes ?? ''} />
      </FormField>
    </FinancialEditor>
  )
}
