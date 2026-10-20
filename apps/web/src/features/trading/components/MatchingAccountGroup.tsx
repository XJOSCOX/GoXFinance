import type { ReactNode } from 'react'
import {
  combinedTradingProgress,
  type TradingAccount,
  type TradingResult,
  type TradingPayout,
} from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { AccountPayoutProgress } from './AccountPayoutProgress'
import { formatMoney } from '../../../lib/money'

export function MatchingAccountGroup({
  accounts,
  results,
  payouts,
  onEditAll,
  children,
}: {
  accounts: TradingAccount[]
  results: TradingResult[]
  payouts: TradingPayout[]
  onEditAll: (accounts: TradingAccount[]) => void
  children: ReactNode
}) {
  const first = accounts[0],
    total = combinedTradingProgress(accounts, results, payouts, new Date().toISOString())
  return (
    <Card className="min-w-0 p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{accounts.map((a) => a.nickname).join(' · ')}</h2>
        </div>
        {first.canManage && !first.deletedAt && (
          <Button size="small" onClick={() => onEditAll(accounts)}>
            Edit all
          </Button>
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Tier per account (not cash)</dt>
          <dd className="mt-1">{formatMoney(first.tierCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Reported balance per account</dt>
          <dd className="mt-1">{formatMoney(first.reportedBalanceCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Max / daily loss per account</dt>
          <dd className="mt-1">
            {formatMoney(first.maximumLossCents)} / {formatMoney(first.dailyLossCents)}
          </dd>
        </div>
        {first.stage !== 'combine' && (
          <div>
            <dt className="text-xs text-slate-500">Combined payout estimate</dt>
            <dd className="mt-1 font-semibold">{formatMoney(total.estimatedTraderCents)}</dd>
          </div>
        )}
      </dl>
      <AccountPayoutProgress account={first} results={results} payouts={payouts} perAccount />
      <details className="mt-4 border-t border-white/10 pt-3">
        <summary className="cursor-pointer text-sm text-slate-300">
          View / edit individual accounts ({accounts.length})
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          Accounts separate automatically when their settings or financial stats differ. Edit all
          changes shared setup and rules; names, actual balances and histories stay individual.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">{children}</div>
      </details>
    </Card>
  )
}
