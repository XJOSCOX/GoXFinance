import {
  tradingRisk,
  groupMatchingTradingAccounts,
  latestSavedRule,
  type TradingAccount,
  type TradingResult,
  type HouseholdMember,
  type TradingPayout,
} from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { TradingRuleDetails } from './TradingRuleDetails'
import { AccountPayoutProgress } from './AccountPayoutProgress'
import { MatchingAccountGroup } from './MatchingAccountGroup'
export function TradingAccounts({
  accounts,
  results,
  payouts,
  members,
  onEdit,
  onDuplicate,
  onRemove,
  onAudit,
  onEditRule,
  onEditAll,
  onPromote,
}: {
  accounts: TradingAccount[]
  results: TradingResult[]
  payouts: TradingPayout[]
  members: HouseholdMember[]
  onEdit: (a: TradingAccount) => void
  onDuplicate: (a: TradingAccount) => void
  onRemove: (a: TradingAccount) => void
  onAudit: (id: string) => void
  onEditRule: (account: TradingAccount, rule: TradingAccount['ruleSnapshots'][number]) => void
  onPromote?: (account: TradingAccount) => void
  onEditAll: (accounts: TradingAccount[]) => void
}) {
  const renderAccount = (account: TradingAccount) => {
    const risk = tradingRisk(account, results, new Date().toISOString()),
      rules = latestSavedRule(account.ruleSnapshots)
    const replaced = new Set(account.ruleSnapshots.map((r) => r.supersedesRuleId).filter(Boolean))
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
            {account.sourceCombineAccountId && (
              <p className="mt-1 text-xs text-slate-500">
                From Combine:{' '}
                {accounts.find((a) => a.id === account.sourceCombineAccountId)?.nickname ??
                  'Historical Combine'}
              </p>
            )}
            {account.promotedToAccountId && (
              <p className="mt-1 text-xs text-slate-500">
                Linked XFA:{' '}
                {accounts.find((a) => a.id === account.promotedToAccountId)?.nickname ??
                  'Historical XFA'}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {members.find((m) => m.id === account.responsibleMemberId)?.fullName}
              {account.maskedExternalId
                ? ' / ****' + account.maskedExternalId.replace(/[*xX -]/g, '')
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-1">
            {onPromote &&
              account.canManage &&
              !account.deletedAt &&
              account.stage === 'combine' &&
              ['active', 'passed'].includes(account.status) &&
              !account.promotedToAccountId && (
                <Button size="small" onClick={() => onPromote(account)}>
                  Promote to XFA
                </Button>
              )}
            {account.canManage && !account.deletedAt && (
              <Button size="small" onClick={() => onDuplicate(account)}>
                Duplicate
              </Button>
            )}
            {account.canManage && !account.deletedAt && rules && (
              <Button size="small" onClick={() => onEditRule(account, rules)}>
                Edit rule
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
        {rules?.profitShareBps != null && (
          <p className="mt-2 text-xs text-slate-400">
            Saved trader share {rules.profitShareBps / 100}% · Provider{' '}
            {(10000 - rules.profitShareBps) / 100}% · Advisory payout cap{' '}
            {formatMoney(rules.maximumPayoutCents)}
          </p>
        )}
        {risk.dailyLimitReached && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-amber-200/20 p-3 text-xs text-amber-200"
          >
            Recorded daily loss limit reached or exceeded. Tracking only; no positions are closed or
            risk limits enforced.
          </p>
        )}
        <AccountPayoutProgress account={account} results={results} payouts={payouts} />
        <details className="mt-4 border-t border-white/10 pt-3 text-xs">
          <summary className="cursor-pointer text-slate-400">
            Account details &amp; rule snapshots
          </summary>
          <p className="mt-2">Activated: {account.activationDate ?? 'Unknown'}</p>
          <p className="mt-2 whitespace-pre-wrap text-slate-400">{account.notes ?? 'No notes'}</p>
          {!rules && <p className="mt-2 text-slate-500">No payout rules entered.</p>}
          {account.ruleSnapshots.map((rule) => (
            <div key={rule.id}>
              <TradingRuleDetails rule={rule} />
              {replaced.has(rule.id) ? (
                <p className="mt-2 text-slate-500">Previous version · preserved for history</p>
              ) : (
                account.canManage &&
                !account.deletedAt && (
                  <Button
                    type="button"
                    size="small"
                    className="mt-2"
                    onClick={() => onEditRule(account, rule)}
                  >
                    Edit this rule
                  </Button>
                )
              )}
            </div>
          ))}
          <p className="mt-3 text-slate-500">
            User-entered rule snapshots are advisory, may be outdated, and do not establish payout
            eligibility. Verify current provider rules externally.
          </p>
        </details>
      </Card>
    )
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {!accounts.length && (
        <Card className="p-8 text-sm text-slate-400">
          No trading accounts. Add an account to begin manual tracking.
        </Card>
      )}
      {groupMatchingTradingAccounts(accounts, results, payouts, new Date().toISOString()).map(
        (group) =>
          group.length === 1 ? (
            renderAccount(group[0])
          ) : (
            <MatchingAccountGroup
              key={group.map((a) => a.id).join(':')}
              accounts={group}
              results={results}
              payouts={payouts}
              onEditAll={onEditAll}
            >
              {group.map(renderAccount)}
            </MatchingAccountGroup>
          ),
      )}
    </div>
  )
}
