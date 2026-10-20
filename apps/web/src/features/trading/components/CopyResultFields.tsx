import { useState } from 'react'
import type { CopyEventInput } from '@goxfinance/shared'
import { AmountField } from '../../../components/financial/EntryFields'
import { formatMoney } from '../../../lib/money'
import { moneyText } from '../../../lib/financial-entry'
import { ProfitLossFields } from './ProfitLossFields'
import type { ResultAmounts } from '../lib/result-amounts'
export function CopyResultFields({
  accountId,
  nickname,
  row,
}: {
  accountId: string
  nickname: string
  row?: CopyEventInput['entries'][number]
}) {
  const [split, setSplit] = useState(!row || row.profitCents != null)
  const [amounts, setAmounts] = useState<ResultAmounts>({
    profit: moneyText(row?.profitCents),
    loss: moneyText(row?.lossCents),
    fees: moneyText(row?.feesCents),
    feesIncluded: row?.feesIncluded ?? !row,
  })
  return (
    <div className="space-y-3">
      {row && (
        <p className="text-xs text-slate-400">
          Saved net result: {formatMoney(row.grossCents - row.feesCents)}
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
        {nickname} enter profit and loss separately
      </label>
      <input type="hidden" name={'split:' + accountId} value={String(split)} />
      {split ? (
        <>
          <ProfitLossFields label={`${nickname} `} value={amounts} onChange={setAmounts} />
          {(['profit', 'loss', 'fees'] as const).map((key) => (
            <input key={key} type="hidden" name={key + ':' + accountId} value={amounts[key]} />
          ))}
          <input
            type="hidden"
            name={'feesIncluded:' + accountId}
            value={String(amounts.feesIncluded ?? false)}
          />
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            The saved breakdown is unknown. Enable separate entry to supply it; no amounts are
            inferred.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <AmountField
              label={`${nickname} signed realized P&L ($)`}
              name={'gross:' + accountId}
              value={row?.grossCents}
              required
            />
            <AmountField
              label={`${nickname} additional fees ($, optional)`}
              name={'fees:' + accountId}
              value={row?.feesCents}
            />
          </div>
        </>
      )}
    </div>
  )
}
