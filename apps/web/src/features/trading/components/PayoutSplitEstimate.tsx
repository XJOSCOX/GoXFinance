import { payoutSplitEstimate, ruleForPayout, type TradingAccount } from '@goxfinance/shared'
import { readMoney } from '../../../lib/financial-entry'
import { formatMoney } from '../../../lib/money'

export function PayoutSplitEstimate({
  account,
  amountText,
  date,
  recordedAt,
}: {
  account?: TradingAccount
  amountText: string
  date: string
  recordedAt?: string
}) {
  const rule = ruleForPayout(account?.ruleSnapshots ?? [], date, recordedAt)
  let amount: number | null = null
  try {
    const data = new FormData()
    data.set('amount', amountText)
    amount = readMoney(data, 'amount')
  } catch {
    /* Invalid inputs are validated on submission. */
  }
  const split = payoutSplitEstimate(amount, rule?.profitShareBps)
  if (!split || !rule)
    return (
      <p className="text-xs text-slate-500">
        Enter an amount and configure a profit share effective on the request date to see a split
        estimate.
      </p>
    )
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-3 text-xs">
      <p>
        Split estimate · {rule.label} · effective {rule.effectiveDate}
      </p>
      <div className="flex flex-wrap justify-between gap-2">
        <span>
          You ({rule.profitShareBps! / 100}%): <strong>{formatMoney(split.traderCents)}</strong>
        </span>
        <span>
          Provider ({(10000 - rule.profitShareBps!) / 100}%): {formatMoney(split.providerCents)}
        </span>
      </div>
      <p className="text-slate-400">
        Estimate on the entered request / approval amount, before other fees or taxes. This is not
        received income; confirm the actual net deposit separately.
      </p>
      {rule.maximumPayoutCents != null && amount! > rule.maximumPayoutCents && (
        <p className="text-amber-200">
          Entered amount exceeds the saved advisory payout cap. Verify the applicable provider
          rules.
        </p>
      )}
    </div>
  )
}
