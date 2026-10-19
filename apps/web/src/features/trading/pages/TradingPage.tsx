import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  sumCents,
  type TradingAccount,
  type TradingResult,
  type TradingPayout,
  type CopyGroup,
  type CopyEvent,
} from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../../components/ui'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { FinancialAudit } from '../../../components/financial/FinancialAudit'
import { useNotify } from '../../../components/ui/useNotify'
import { formatMoney } from '../../../lib/money'
import { useHousehold } from '../../households/hooks/useHousehold'
import { useAuth } from '../../auth/hooks/useAuth'
import { useTrading } from '../hooks/useTrading'
import { saveTrading } from '../api/tradingClient'
import { AccountForm } from '../components/AccountForm'
import { ResultForm } from '../components/ResultForm'
import { PayoutForm } from '../components/PayoutForm'
import { GroupForm } from '../components/GroupForm'
import { CopyEventForm } from '../components/CopyEventForm'
import { BatchForm } from '../components/BatchForm'
import { TradingAccounts } from '../components/TradingAccounts'
import { TradingPerformance } from '../components/TradingPerformance'
import { TradingHistory } from '../components/TradingHistory'
type Editor =
  | { kind: 'accounts'; record?: TradingAccount }
  | { kind: 'results'; record?: TradingResult }
  | { kind: 'payouts'; record?: TradingPayout }
  | { kind: 'groups'; record?: CopyGroup }
  | { kind: 'events'; record?: CopyEvent }
  | { kind: 'batches'; record?: undefined }
export function TradingPage() {
  const { householdId: home = '' } = useParams(),
    { data, members, income, error, refresh } = useTrading(home),
    { households, selected, select } = useHousehold(),
    { user } = useAuth(),
    notify = useNotify(),
    [tab, setTab] = useState('accounts'),
    [editor, setEditor] = useState<Editor | null>(null),
    [audit, setAudit] = useState('')
  const household = households.find((h) => h.id === home)
  useEffect(() => {
    if (household && selected?.id !== home) select(home)
  }, [home, household, selected?.id, select])
  const accounts = data?.accounts ?? [],
    managed = accounts.filter((a) => a.canManage),
    canCreate = data?.canCreate ?? household?.role !== 'viewer'
  const allowedMembers = members.filter(
    (m) => household?.role === 'owner' || m.linkedUserId === user?.id,
  )
  const save = async (body: unknown) => {
    if (!editor) return
    await saveTrading(home, editor.kind, body, editor.record?.id)
    await refresh()
    notify('success', 'Trading record saved')
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
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <SummaryStat
              compact
              label="Net realized P&L"
              amount={formatMoney(sumCents(data.results.map((r) => r.netCents)))}
              detail="All recorded accounts; not deposited income"
            />
            <SummaryStat
              compact
              label="Payouts requested / approved"
              amount={formatMoney(
                sumCents(
                  data.payouts
                    .filter((p) => ['requested', 'approved'].includes(p.status))
                    .map((p) => p.requestedCents),
                ),
              )}
              detail="Outstanding requests; not income"
            />
            <SummaryStat
              compact
              label="Payout deposits received"
              amount={formatMoney(
                sumCents(
                  data.payouts.filter((p) => p.status === 'paid').map((p) => p.receivedCents ?? 0),
                ),
              )}
              detail="Linked deposits counted once in Income"
            />
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {['accounts', 'performance', 'results', 'groups', 'payouts'].map((value) => (
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
                    performance: 'Performance',
                    results: 'Results',
                    groups: 'Copy groups',
                    payouts: 'Payouts',
                  }[value]
                }
              </Button>
            ))}
          </div>
          {managed.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <Button size="small" onClick={() => setEditor({ kind: 'results' })}>
                Record daily result
              </Button>
              <Button size="small" onClick={() => setEditor({ kind: 'payouts' })}>
                Record payout
              </Button>
              <Button size="small" onClick={() => setEditor({ kind: 'batches' })}>
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
            <TradingAccounts
              accounts={accounts}
              results={data.results}
              members={members}
              onEdit={(record) => setEditor({ kind: 'accounts', record })}
              onAudit={setAudit}
            />
          ) : tab === 'performance' ? (
            <TradingPerformance data={data} />
          ) : (
            <TradingHistory
              data={data}
              tab={tab}
              onResult={(record) => setEditor({ kind: 'results', record })}
              onPayout={(record) => setEditor({ kind: 'payouts', record })}
              onGroup={(record) => setEditor({ kind: 'groups', record })}
              onEvent={(record) => setEditor({ kind: 'events', record })}
              onAudit={setAudit}
            />
          )}
        </>
      )}
      {editor?.kind === 'accounts' && (
        <AccountForm
          account={editor.record}
          members={allowedMembers}
          save={save}
          close={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'results' && (
        <ResultForm
          result={editor.record}
          accounts={managed}
          save={save}
          close={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'payouts' && (
        <PayoutForm
          payout={editor.record}
          accounts={managed}
          income={income}
          save={save}
          close={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'groups' && (
        <GroupForm
          group={editor.record}
          accounts={managed}
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
        <BatchForm accounts={managed} save={save} close={() => setEditor(null)} />
      )}
      {audit && (
        <FinancialAudit
          path={`households/${home}/trading/audit/${audit}`}
          close={() => setAudit('')}
        />
      )}
    </WorkspaceLayout>
  )
}
