import { combinedTradingProgress, type TradingData } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'

export function CombinedPayoutProgress({ data }: { data: TradingData }) {
  const summary = combinedTradingProgress(
    data.accounts,
    data.results,
    data.payouts,
    new Date().toISOString(),
  )
  if (!summary.accountCount) return null
  return (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold">
          Combined payout progress · {summary.accountCount} active accounts
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          {summary.targetMetCount} accounts meet their recorded day target. Days cannot be pooled
          between accounts.
        </p>
      </div>
      <div>
        <p className="text-xs text-slate-500">
          {summary.estimatedAccountCount < summary.accountCount
            ? 'Partial known estimate'
            : 'Combined estimate'}{' '}
          after each account's split
        </p>
        <p className="mt-1 text-xl font-semibold tabular-nums">
          {formatMoney(summary.estimatedTraderCents)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {summary.estimatedAccountCount}/{summary.accountCount} configured · Not confirmed income
          or payout eligibility
        </p>
      </div>
    </Card>
  )
}
