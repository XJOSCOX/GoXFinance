import {
  tradingRisk,
  type TradingAccount,
  type TradingResult,
  type HouseholdMember,
} from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function TradingAccounts({
  accounts,
  results,
  members,
  onEdit,
  onDuplicate,
  onRemove,
  onAudit,
}: {
  accounts: TradingAccount[]
  results: TradingResult[]
  members: HouseholdMember[]
  onEdit: (a: TradingAccount) => void
  onDuplicate: (a: TradingAccount) => void
  onRemove: (a: TradingAccount) => void
  onAudit: (id: string) => void
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {!accounts.length && (
        <Card className="p-8 text-sm text-slate-400">
          No trading accounts. Add an account to begin manual tracking.
        </Card>
      )}
      {accounts.map((account) => {
        const risk = tradingRisk(account, results, new Date().toISOString()),
          rules = account.ruleSnapshots.at(-1)
        return (
          <Card key={account.id} className="min-w-0 p-5">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h2 className="font-semibold">{account.nickname}</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Topstep /{' '}
                  {account.stage === 'combine' ? 'Trading Combine' : account.stage.toUpperCase()} /{' '}
                  {account.xfaPath.replaceAll('_', ' ')} / {account.status}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {members.find((m) => m.id === account.responsibleMemberId)?.fullName}
                  {account.maskedExternalId
                    ? ' / ****' + account.maskedExternalId.replace(/[*xX -]/g, '')
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-1">
                {account.canManage && !account.deletedAt && (
                  <Button size="small" onClick={() => onDuplicate(account)}>
                    Duplicate
                  </Button>
                )}
                {account.canManage && !account.deletedAt && (
                  <Button size="small" onClick={() => onEdit(account)}>
                    Edit
                  </Button>
                )}
                <Button size="small" variant="ghost" onClick={() => onAudit(account.id)}>
                  History
                </Button>
                {account.canManage && (
                  <Button size="small" variant="ghost" onClick={() => onRemove(account)}>
                    {account.deletedAt ? 'Restore / Delete' : 'Delete'}
                  </Button>
                )}
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              {[
                ['Reported trading balance', account.reportedBalanceCents],
                ['Nominal tier (not cash)', account.tierCents],
                ['Maximum loss limit', account.maximumLossCents],
                ['Daily loss limit', account.dailyLossCents],
              ].map(([label, amount]) => (
                <div key={String(label)}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-1 tabular-nums">{formatMoney(amount as number | null)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-slate-400">
              {account.timezone} / session starts {account.sessionStart} / Current session net{' '}
              {formatMoney(risk.netCents)}
            </p>
            {risk.dailyLimitReached && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-amber-200/20 p-3 text-xs text-amber-200"
              >
                Recorded daily loss limit reached or exceeded. Tracking only; no positions are
                closed or risk limits enforced.
              </p>
            )}
            <details className="mt-4 border-t border-white/10 pt-3 text-xs">
              <summary className="cursor-pointer text-slate-400">
                Account details &amp; rule snapshots
              </summary>
              <p className="mt-2">Activated: {account.activationDate ?? 'Unknown'}</p>
              <p className="mt-2 whitespace-pre-wrap text-slate-400">
                {account.notes ?? 'No notes'}
              </p>
              {!rules && <p className="mt-2 text-slate-500">No payout rules entered.</p>}
              {account.ruleSnapshots.map((rule) => (
                <div key={rule.id} className="mt-3 space-y-1 rounded-lg border border-white/10 p-3">
                  <p>
                    {rule.label} / effective {rule.effectiveDate}
                  </p>
                  <p>
                    Minimum days: {rule.minimumDays ?? 'Unknown'} / Minimum net:{' '}
                    {formatMoney(rule.minimumNetCents)}
                  </p>
                  <p>
                    Maximum payout: {formatMoney(rule.maximumPayoutCents)} / Share:{' '}
                    {rule.profitShareBps === null ? 'Unknown' : rule.profitShareBps / 100 + '%'}
                  </p>
                  <p className="text-slate-400">{rule.notes}</p>
                </div>
              ))}
              <p className="mt-3 text-slate-500">
                User-entered rule snapshots are advisory, may be outdated, and do not establish
                payout eligibility. Verify current provider rules externally.
              </p>
            </details>
          </Card>
        )
      })}
    </div>
  )
}
