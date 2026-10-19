import { useState } from 'react'
import { tradingResultSchema, type TradingAccount, type TradingResult } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField } from '../../../components/financial/EntryFields'
import { readMoney, text, optionalText } from '../../../lib/financial-entry'
import { FormField } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
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
          grossCents: readMoney(data, 'grossCents', true),
          feesCents: readMoney(data, 'feesCents', true),
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
      <div className="grid gap-4 sm:grid-cols-2">
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
