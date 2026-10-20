import { Link } from 'react-router-dom'
import { Landmark } from 'lucide-react'
import type { BankingData } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { useBanking } from '../../banking/hooks/useBanking'
import { BankAmount } from '../../banking/components/BankAmount'
export function OverviewBanking({ home }: { home: string }) {
  const { data, error } = useBanking<BankingData>(home)
  if (error)
    return <p className="mt-3 text-xs text-slate-400">Bank observations unavailable: {error}</p>
  if (!data?.accounts.length) return null
  return (
    <Card className="mt-3 p-4">
      <details>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Landmark size={16} className="text-[#adbcad]" />
            Bank observations{' '}
            <span className="font-normal text-slate-400">
              · {data.accounts.filter((a) => a.status === 'active').length} accounts
            </span>
          </span>
          <span className="text-xs text-slate-400">
            {data.unreviewed} need review · {data.reconciled} reconciled · Expand
          </span>
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.accounts
            .filter((a) => a.status === 'active')
            .map((a) => (
              <div key={a.id} className="rounded-lg border border-white/10 p-3">
                <div className="flex justify-between gap-2 text-sm">
                  <span>{a.name}</span>
                  <strong>
                    <BankAmount cents={a.balance?.currentCents ?? null} currency={a.currency} />
                  </strong>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {a.type === 'credit_card'
                    ? 'Credit liability — not a cash asset'
                    : 'Balance snapshot — not income'}{' '}
                  ·{' '}
                  {a.balance
                    ? new Date(a.balance.observedAt).toLocaleDateString()
                    : 'No observation'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {a.lastSyncAt
                    ? 'Synced ' + new Date(a.lastSyncAt).toLocaleString()
                    : a.connectionStatus === 'manual'
                      ? 'Manual account'
                      : 'Not synchronized'}
                </p>
              </div>
            ))}
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs">
          <span className="text-slate-400">
            Unmatched posted activity: {data.unmatchedInflows} deposits · {data.unmatchedOutflows}{' '}
            withdrawals. Not included in income or spending.
          </span>
          <Link className="text-[#adbcad] underline" to={`/households/${home}/transactions`}>
            Review inbox
          </Link>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Mapped assets and credit liabilities are counted through their existing ledgers, never
          added again here.
        </p>
      </details>
    </Card>
  )
}
