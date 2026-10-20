import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Landmark } from 'lucide-react'
import type { BankAccount, BankingData } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../../components/ui'
import { BankHistory } from '../components/BankHistory'
import { useNotify } from '../../../components/ui/useNotify'
import { apiRequest } from '../../../lib/api'
import { useBanking } from '../hooks/useBanking'
import { BankAccountForm } from '../components/BankAccountForm'
import { BankBalanceForm } from '../components/BankBalanceForm'
import { BankAmount } from '../components/BankAmount'
export function BankAccountsPage() {
  const { householdId = '' } = useParams()
  return <BankAccounts key={householdId} home={householdId} />
}
function BankAccounts({ home }: { home: string }) {
  const { data, error, refresh } = useBanking<BankingData>(home),
    notify = useNotify(),
    [editor, setEditor] = useState<BankAccount | null | undefined>(),
    [balance, setBalance] = useState<BankAccount>(),
    [audit, setAudit] = useState(''),
    [hidden, setHidden] = useState(false)
  async function save(path: string, body: unknown, editing = false) {
    await apiRequest(`households/${home}/banking/accounts${path}`, {
      method: editing ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    })
    refresh()
    notify('success', 'Bank record saved')
  }
  return (
    <WorkspaceLayout title="Bank accounts">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bank accounts</h1>
          <p className="mt-1 text-sm text-slate-400">
            Account balances and imported activity, separate from your financial ledger.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            className="rounded-lg border border-white/10 px-3 py-2 text-sm"
            to={`/households/${home}/transactions`}
          >
            Transaction inbox{data ? ` · ${data.unreviewed}` : ''}
          </Link>
          {data?.owner && (
            <Button variant="primary" onClick={() => setEditor(null)}>
              Add account
            </Button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="text-rose-300">
          {error}
          <Button onClick={refresh}>Retry</Button>
        </p>
      )}
      {!data && !error && <p role="status">Loading accounts…</p>}
      {data && (
        <>
          <label className="mb-4 flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            Show hidden accounts
          </label>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {data.accounts
              .filter((a) => hidden || a.status === 'active')
              .map((a) => (
                <Card key={a.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <Landmark className="mt-1 text-[#adbcad]" size={20} />
                      <div>
                        <h2 className="font-semibold">{a.name}</h2>
                        <p className="mt-1 text-xs text-slate-400">
                          {a.institution}
                          {a.mask ? ` · •••• ${a.mask}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">{a.type.replaceAll('_', ' ')}</span>
                  </div>
                  <div className="my-5 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-slate-400">Current balance</p>
                      <strong className="mt-1 block text-lg">
                        <BankAmount cents={a.balance?.currentCents ?? null} currency={a.currency} />
                      </strong>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">
                        {a.type === 'credit_card' ? 'Available credit' : 'Available balance'}
                      </p>
                      <strong className="mt-1 block text-lg">
                        <BankAmount
                          cents={a.balance?.availableCents ?? null}
                          currency={a.currency}
                        />
                      </strong>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    {a.balance
                      ? `Observed ${new Date(a.balance.observedAt).toLocaleString()}`
                      : 'No balance observation'}{' '}
                    · {a.connectionStatus}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
                    {a.canManage && (
                      <>
                        <Button size="small" onClick={() => setEditor(a)}>
                          Edit
                        </Button>
                        <Button size="small" onClick={() => setBalance(a)}>
                          Record balance
                        </Button>
                      </>
                    )}
                    <Button size="small" onClick={() => setAudit(a.id)}>
                      History
                    </Button>
                  </div>
                </Card>
              ))}
          </div>
          {!data.accounts.length && (
            <Card className="p-10 text-center">
              <Landmark className="mx-auto mb-3 text-[#adbcad]" />
              <h2 className="font-semibold">Your accounts, in one place</h2>
              <p className="mt-2 text-sm text-slate-400">
                {data.owner
                  ? 'Add a manual account to import a statement.'
                  : 'The Owner can grant you access to an account.'}
              </p>
            </Card>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Observations do not update assets, debts or available household cash automatically.
            Credit limits and nominal trading balances are not cash.
          </p>
          {editor !== undefined && (
            <BankAccountForm
              data={data}
              record={editor ?? undefined}
              close={() => setEditor(undefined)}
              save={(body) => save(editor ? '/' + editor.id : '', body, !!editor)}
            />
          )}
          {balance && (
            <BankBalanceForm
              account={balance}
              close={() => setBalance(undefined)}
              save={(body) => save('/' + balance.id + '/balances', body)}
            />
          )}
          {audit && (
            <BankHistory
              home={home}
              id={audit}
              currency={data.accounts.find((a) => a.id === audit)?.currency ?? null}
              close={() => setAudit('')}
            />
          )}
        </>
      )}
    </WorkspaceLayout>
  )
}
