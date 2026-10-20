import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  type TradingAccount,
  type TradingResult,
  type TradingPayout,
  type CopyGroup,
  type CopyEvent,
} from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../../components/ui'
import { FinancialAudit } from '../../../components/financial/FinancialAudit'
import { useNotify } from '../../../components/ui/useNotify'
import { useHousehold } from '../../households/hooks/useHousehold'
import { useAuth } from '../../auth/hooks/useAuth'
import { useTrading } from '../hooks/useTrading'
import { saveTrading, removeTradingAccount, removeTradingResult } from '../api/tradingClient'
import { AccountRemovalDialog } from '../components/AccountRemovalDialog'
import { AccountForm } from '../components/AccountForm'
import { AccountRulesForm } from '../components/AccountRulesForm'
import { EditRuleForm } from '../components/EditRuleForm'
import { CombinedPayoutProgress } from '../components/CombinedPayoutProgress'
import { ResultRemovalDialog } from '../components/ResultRemovalDialog'
import { CombinePromotionForm } from '../components/CombinePromotionForm'
import { ResultForm } from '../components/ResultForm'
import { DailyResultsForm } from '../components/DailyResultsForm'
import { PayoutForm } from '../components/PayoutForm'
import { GroupForm } from '../components/GroupForm'
import { CopyEventForm } from '../components/CopyEventForm'
import { BatchForm } from '../components/BatchForm'
import { TradingAccounts } from '../components/TradingAccounts'
import { TradingPerformance } from '../components/TradingPerformance'
import { TradingHistory } from '../components/TradingHistory'
import { TradingJournalCalendar } from '../components/TradingJournalCalendar'
import { TradingSummary } from '../components/TradingSummary'
type Editor =
  | { kind: 'accounts'; record?: TradingAccount; template?: TradingAccount }
  | { kind: 'results'; record?: TradingResult }
  | { kind: 'payouts'; record?: TradingPayout }
  | { kind: 'groups'; record?: CopyGroup }
  | { kind: 'events'; record?: CopyEvent }
  | { kind: 'batches'; record?: undefined }
  | { kind: 'accounts/rules'; record?: undefined; accounts?: TradingAccount[] }
export function TradingPage() {
  const { householdId: home = '' } = useParams(),
    { data, members, income, error, refresh } = useTrading(home),
    { households, selected, select } = useHousehold(),
    { user } = useAuth(),
    notify = useNotify(),
    [tab, setTab] = useState('accounts'),
    [editor, setEditor] = useState<Editor | null>(null),
    [audit, setAudit] = useState('')
  const [promotion, setPromotion] = useState<TradingAccount | null>(null)
  const [resultRemoval, setResultRemoval] = useState<TradingResult | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [removal, setRemoval] = useState<TradingAccount | null>(null)
  const [ruleEditor, setRuleEditor] = useState<{
    account: TradingAccount
    rule: TradingAccount['ruleSnapshots'][number]
  } | null>(null)
  const household = households.find((h) => h.id === home)
  useEffect(() => {
    if (household && selected?.id !== home) select(home)
  }, [home, household, selected?.id, select])
  const accounts = data?.accounts ?? [],
    managed = accounts.filter((a) => a.canManage && !a.deletedAt),
    funded = managed.filter((a) => a.stage !== 'combine'),
    canCreate = data?.canCreate ?? household?.role !== 'viewer'
  const allowedMembers = members.filter(
    (m) => household?.role === 'owner' || m.linkedUserId === user?.id,
  )
  const save = async (body: unknown, batch = false) => {
    if (!editor) return
    await saveTrading(home, batch ? 'accounts/batch' : editor.kind, body, editor.record?.id)
    await refresh()
    notify('success', batch ? 'Trading accounts created' : 'Trading record saved')
  }
  return (
    <WorkspaceLayout title="Trading">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Trading</h1>
          <p className="mt-2 text-sm text-slate-400">
            Topstep accounts, realized performance, and externally requested payouts.
          </p>
        </div>
        {canCreate && (
          <Button variant="primary" onClick={() => setEditor({ kind: 'accounts' })}>
            Add account
          </Button>
        )}
      </header>
      <p className="mb-4 text-xs leading-5 text-slate-500">
        Manual tracking only. Trading P&amp;L and nominal tiers are not available household cash.
        Only confirmed payout deposits reach Income. Copying must comply with current provider
        rules; this app does not execute trades or enforce risk limits.
      </p>
      {error && (
        <Card className="mb-4 p-4">
          <p role="alert">{error}</p>
          <Button onClick={() => void refresh()}>Retry</Button>
        </Card>
      )}
      {!data && !error && <p role="status">Loading trading records...</p>}
      {data && (
        <>
          <TradingSummary data={data} />
          <div className="mb-4 flex flex-wrap gap-2">
            {['accounts', 'journal', 'performance', 'results', 'groups', 'payouts'].map((value) => (
              <Button
                key={value}
                size="small"
                aria-pressed={tab === value}
                variant={tab === value ? 'primary' : 'ghost'}
                onClick={() => setTab(value)}
              >
                {
                  {
                    accounts: 'Accounts',
                    journal: 'Daily journal',
                    performance: 'Performance',
                    results: 'Results',
                    groups: 'Copy groups',
                    payouts: 'Payouts',
                  }[value]
                }
              </Button>
            ))}
          </div>
          {tab === 'accounts' && <CombinedPayoutProgress data={data} />}
          {managed.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <Button size="small" onClick={() => setEditor({ kind: 'accounts/rules' })}>
                Update account rules
              </Button>
              <Button size="small" onClick={() => setEditor({ kind: 'results' })}>
                Record daily result
              </Button>
              <Button
                size="small"
                disabled={!funded.length}
                onClick={() => setEditor({ kind: 'payouts' })}
              >
                Record payout
              </Button>
              <Button
                size="small"
                disabled={!funded.length}
                onClick={() => setEditor({ kind: 'batches' })}
              >
                Record payout batch
              </Button>
              {managed.length >= 2 && (
                <Button size="small" onClick={() => setEditor({ kind: 'groups' })}>
                  Create copy group
                </Button>
              )}
              {data.groups.some((g) => g.canManage && g.status === 'active') && (
                <Button size="small" onClick={() => setEditor({ kind: 'events' })}>
                  Record copied event
                </Button>
              )}
            </div>
          )}
          {tab === 'accounts' ? (
            <>
              <label className="mb-3 flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                />
                Show hidden accounts ({accounts.filter((a) => a.deletedAt).length})
              </label>
              <TradingAccounts
                accounts={accounts.filter((a) => showDeleted || !a.deletedAt)}
                results={data.results}
                payouts={data.payouts}
                members={members}
                onEdit={(record) => setEditor({ kind: 'accounts', record })}
                onPromote={setPromotion}
                onDuplicate={(template) => setEditor({ kind: 'accounts', template })}
                onRemove={setRemoval}
                onAudit={setAudit}
                onEditRule={(account, rule) => setRuleEditor({ account, rule })}
                onEditAll={(accounts) => setEditor({ kind: 'accounts/rules', accounts })}
              />
            </>
          ) : tab === 'journal' ? (
            <TradingJournalCalendar data={data} />
          ) : tab === 'performance' ? (
            <TradingPerformance data={data} />
          ) : (
            <TradingHistory
              data={data}
              tab={tab}
              onDeleteResult={setResultRemoval}
              onResult={(record) => setEditor({ kind: 'results', record })}
              onPayout={(record) => setEditor({ kind: 'payouts', record })}
              onGroup={(record) => setEditor({ kind: 'groups', record })}
              onEvent={(record) => setEditor({ kind: 'events', record })}
              onAudit={setAudit}
            />
          )}
        </>
      )}
      {promotion && (
        <CombinePromotionForm
          account={promotion}
          close={() => setPromotion(null)}
          save={async (body) => {
            await saveTrading(home, `accounts/${promotion.id}/promote`, body)
            await refresh()
            notify('success', 'Combine history preserved and linked XFA created')
          }}
        />
      )}
      {editor?.kind === 'accounts' && (
        <AccountForm
          account={editor.record}
          template={editor.template}
          members={allowedMembers}
          save={save}
          close={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'accounts/rules' && (
        <AccountRulesForm
          accounts={editor.accounts ?? managed}
          selectAll={!!editor.accounts}
          save={save}
          close={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'results' && !editor.record && (
        <DailyResultsForm
          accounts={managed}
          save={async (body) => {
            await saveTrading(home, 'results/batch', body)
            await refresh()
            notify('success', 'Daily results recorded')
          }}
          close={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'results' && editor.record && (
        <ResultForm
          result={editor.record}
          accounts={editor.record ? accounts.filter((a) => a.canManage) : managed}
          save={save}
          close={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'payouts' && (
        <PayoutForm
          payout={editor.record}
          accounts={editor.record ? accounts.filter((a) => a.canManage) : funded}
          income={income}
          onBatch={() => setEditor({ kind: 'batches' })}
          save={save}
          close={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'groups' && (
        <GroupForm
          group={editor.record}
          accounts={editor.record ? accounts.filter((a) => a.canManage) : managed}
          save={save}
          close={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'events' && (
        <CopyEventForm
          event={editor.record}
          groups={data?.groups.filter((g) => g.canManage) ?? []}
          accounts={accounts}
          save={save}
          close={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'batches' && (
        <BatchForm accounts={funded} save={save} close={() => setEditor(null)} />
      )}
      {audit && (
        <FinancialAudit
          path={`households/${home}/trading/audit/${audit}`}
          close={() => setAudit('')}
        />
      )}
      {resultRemoval && (
        <ResultRemovalDialog
          result={resultRemoval}
          close={() => setResultRemoval(null)}
          save={async (body) => {
            await removeTradingResult(home, resultRemoval.id, body)
            await refresh()
            notify('success', 'Daily result deleted; audit history retained')
          }}
        />
      )}
      {removal && (
        <AccountRemovalDialog
          account={removal}
          close={() => setRemoval(null)}
          save={async (permanent) => {
            await removeTradingAccount(home, removal, permanent)
            await refresh()
            notify(
              'success',
              permanent
                ? 'Account permanently deleted'
                : removal.deletedAt
                  ? 'Account restored'
                  : 'Account hidden',
            )
          }}
        />
      )}
      {ruleEditor && (
        <EditRuleForm
          account={ruleEditor.account}
          rule={ruleEditor.rule}
          close={() => setRuleEditor(null)}
          save={async (body) => {
            await saveTrading(
              home,
              `accounts/${ruleEditor.account.id}/rules`,
              body,
              ruleEditor.rule.id,
            )
            await refresh()
            notify('success', 'Rule changes saved; previous version retained')
          }}
        />
      )}
    </WorkspaceLayout>
  )
}
