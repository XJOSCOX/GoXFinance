import { useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { SettlementOffer, PayoffScenarioInput } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../../components/ui'
import { FinancialAudit } from '../../../components/financial/FinancialAudit'
import { useNotify } from '../../../components/ui/useNotify'
import { usePlanning } from '../hooks/usePlanning'
import { savePlanning } from '../api/planningClient'
import { PayoffPlanner } from '../components/PayoffPlanner'
import { SettlementList } from '../components/SettlementList'
import { SettlementForm } from '../components/SettlementForm'
export function DebtPlanningPage() {
  const [search] = useSearchParams()
  const { householdId: home = '' } = useParams(),
    { data, error, refresh } = usePlanning(home),
    [tab, setTab] = useState(search.has('settlementDebt') ? 'settlements' : 'payoff'),
    [editor, setEditor] = useState<SettlementOffer | null | undefined>(
      search.has('settlementDebt') ? null : undefined,
    ),
    [audit, setAudit] = useState(''),
    [history, setHistory] = useState(''),
    key = useRef(crypto.randomUUID()),
    notify = useNotify()
  async function saveScenario(input: PayoffScenarioInput) {
    await savePlanning(home, 'scenarios', { idempotencyKey: key.current, values: input })
    await refresh()
    key.current = crypto.randomUUID()
    notify('success', 'Projected scenario saved')
  }
  const historical = data?.scenarios.find((s) => s.id === history)
  return (
    <WorkspaceLayout title="Debt planning">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Debt planning</h1>
        <p className="mt-1 text-sm text-slate-400">
          Compare projected payoff strategies and track real settlement agreements separately.
        </p>
      </header>
      <div className="mb-4 flex flex-wrap gap-2">
        {['payoff', 'settlements', 'history'].map((t) => (
          <Button key={t} variant={tab === t ? 'primary' : 'secondary'} onClick={() => setTab(t)}>
            {t === 'payoff'
              ? 'Payoff scenarios'
              : t === 'settlements'
                ? 'Settlement offers'
                : 'Historical scenarios'}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-rose-300">
          {error}
          <Button onClick={() => void refresh().catch(() => {})}>Retry</Button>
        </p>
      )}
      {!data && !error && <p role="status">Loading debt planning…</p>}
      {data && (
        <>
          {tab === 'payoff' && (
            <PayoffPlanner debts={data.debts} save={data.canSave ? saveScenario : undefined} />
          )}
          {tab === 'settlements' && (
            <SettlementList data={data} edit={(o) => setEditor(o ?? null)} audit={setAudit} />
          )}
          {tab === 'history' && (
            <div className="space-y-3">
              {data.scenarios.map((s) => (
                <Card key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="text-sm">
                    {s.input.name} · {new Date(s.createdAt).toLocaleString()} · Historical debt
                    snapshot
                  </span>
                  <Button onClick={() => setHistory(s.id)}>View scenario</Button>
                </Card>
              ))}
              {!data.scenarios.length && <p>No saved scenarios.</p>}
              {historical && (
                <PayoffPlanner
                  key={historical.id}
                  debts={historical.debts}
                  initial={historical.input}
                />
              )}
            </div>
          )}
          {editor !== undefined && (
            <SettlementForm
              initialDebtId={search.get('settlementDebt') ?? undefined}
              data={data}
              record={editor ?? undefined}
              close={() => setEditor(undefined)}
              save={async (body) => {
                await savePlanning(home, 'offers' + (editor ? '/' + editor.id : ''), body, !!editor)
                await refresh()
                notify('success', 'Settlement offer saved')
              }}
            />
          )}
          {audit && (
            <FinancialAudit
              path={`households/${home}/debt-planning/${audit}/audit`}
              close={() => setAudit('')}
            />
          )}
        </>
      )}
    </WorkspaceLayout>
  )
}
