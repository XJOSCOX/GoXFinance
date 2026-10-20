import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import type { BankInbox, bankSuggestion } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { useBanking } from '../hooks/useBanking'
import { BankAmount } from '../components/BankAmount'
import { StatementImport } from '../components/StatementImport'
type InboxData = BankInbox & { suggestions: Record<string, ReturnType<typeof bankSuggestion>> }
export function BankInboxPage() {
  const { householdId = '' } = useParams()
  return <TransactionInbox key={householdId} home={householdId} />
}
function TransactionInbox({ home }: { home: string }) {
  const { data, error, refresh } = useBanking<InboxData>(home, '/inbox'),
    [importing, setImporting] = useState(false),
    [account, setAccount] = useState(''),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('unreviewed'),
    [from, setFrom] = useState(''),
    [until, setUntil] = useState('')
  const rows =
    data?.transactions.filter(
      (t) =>
        (!account || t.accountId === account) &&
        (!status || t.reviewStatus === status) &&
        (!from || t.date >= from) &&
        (!until || t.date <= until) &&
        `${t.description} ${t.merchant ?? ''}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? []
  return (
    <WorkspaceLayout title="Transactions">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Transaction inbox</h1>
          <p className="mt-1 text-sm text-slate-400">
            Imported activity stays separate from recorded income and spending until approved.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            className="rounded-lg border border-white/10 px-3 py-2 text-sm"
            to={`/households/${home}/bank-accounts`}
          >
            Bank accounts
          </Link>
          {data?.canReview && data.accounts.some((a) => a.status === 'active') && (
            <Button variant="primary" onClick={() => setImporting(true)}>
              Import statement
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
      {!data && !error && <p role="status">Loading transactions…</p>}
      {data && (
        <>
          <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
            <FormField label="Search">
              <Input
                placeholder="Merchant or description"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </FormField>
            <FormField label="Account">
              <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">All accessible accounts</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Review status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {['unreviewed', 'needs_review', 'reconciled', 'ignored', 'superseded'].map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll('_', ' ')}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </FormField>
            <FormField label="Through">
              <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </FormField>
            <div className="flex items-end">
              <Button onClick={refresh}>Refresh</Button>
            </div>
          </Card>
          <div className="space-y-2">
            {rows.map((t) => (
              <Card key={t.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{t.merchant || t.description}</strong>
                    <span className="rounded bg-white/5 px-2 py-1 text-[10px] uppercase text-slate-400">
                      {t.pending ? 'Pending' : 'Posted'} ·{' '}
                      {t.removed ? 'Removed by provider' : t.reviewStatus.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs text-slate-400">
                    {t.date} · {data.accounts.find((a) => a.id === t.accountId)?.name} ·{' '}
                    {t.description}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">{data.suggestions[t.id]?.reason}</p>
                </div>
                <div className="text-right">
                  <strong className={t.amountCents > 0 ? 'text-emerald-300' : 'text-slate-200'}>
                    <BankAmount cents={t.amountCents} currency={t.currency} />
                  </strong>
                  <p className="text-[10px] text-slate-500">
                    {t.amountCents > 0
                      ? 'Inflow · not assumed income'
                      : 'Outflow · not yet accounting'}
                  </p>
                </div>
              </Card>
            ))}
          </div>
          {!rows.length && (
            <Card className="p-10 text-center">
              <Inbox className="mx-auto mb-3 text-[#adbcad]" />
              <h2 className="font-semibold">No matching transactions</h2>
              <p className="mt-2 text-sm text-slate-400">
                Import a statement or adjust your filters.
              </p>
            </Card>
          )}
          <p className="mt-4 text-xs text-slate-500">
            {rows.length} shown · Suggestions require review. Pending imports never create completed
            financial entries.
          </p>
          {importing && (
            <StatementImport
              home={home}
              accounts={data.accounts}
              close={() => setImporting(false)}
              saved={refresh}
            />
          )}
        </>
      )}
    </WorkspaceLayout>
  )
}
