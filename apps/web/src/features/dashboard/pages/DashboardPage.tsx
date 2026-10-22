import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, SlidersHorizontal } from 'lucide-react'
import { localBillDate } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { useHousehold } from '../../households/hooks/useHousehold'
import { Button, Card, Input } from '../../../components/ui'
import { useCommandCenter } from '../../command-center/useCommandCenter'
import { CommandSummary } from '../../command-center/CommandSummary'
import { CommandActions, CommandObligations } from '../../command-center/CommandActions'
import {
  PaycheckFunding,
  CommandTimeline,
  CommandProgress,
} from '../../command-center/CommandDetails'
import { CommandSettings } from '../../command-center/CommandSettings'
import { quickLabels, quickDestination } from '../../command-center/command-quick-actions'
export function DashboardPage() {
  const { selected } = useHousehold()
  return (
    <WorkspaceLayout title="Overview">
      {selected ? (
        <CommandCenter key={selected.id} home={selected.id} name={selected.name} />
      ) : (
        <Card className="p-5">Select a household to view your Command Center.</Card>
      )}
    </WorkspaceLayout>
  )
}
function CommandCenter({ home, name }: { home: string; name: string }) {
  const [month, setMonth] = useState(localBillDate().slice(0, 7)),
    [settings, setSettings] = useState(false)
  const { data: d, error, refresh } = useCommandCenter(home, month)
  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">{name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Financial Command Center</h1>
          <p className="mt-1 text-sm text-slate-400">Your cash, priorities and next steps.</p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <label className="min-w-0 flex-1 text-xs text-slate-400 sm:flex-none">
            Accounting month
            <Input
              className="mt-1 min-w-0"
              type="month"
              aria-label="Accounting month"
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value)
              }}
            />
          </label>
          <Button aria-label="Refresh Command Center" onClick={refresh}>
            <RefreshCw size={16} />
          </Button>
          {d && (
            <Button aria-label="Customize Command Center" onClick={() => setSettings(true)}>
              <SlidersHorizontal size={16} />
            </Button>
          )}
        </div>
      </header>
      {error ? (
        <Card className="p-5">
          <p role="alert" className="text-rose-300">
            {error}
          </p>
          <Button className="mt-3" onClick={refresh}>
            Retry
          </Button>
        </Card>
      ) : !d ? (
        <p role="status">Loading your Command Center…</p>
      ) : (
        <>
          {d.privacyLimited && (
            <p className="text-xs text-slate-400">
              Your authorized records only. Owner-only cash and private sources are excluded.
            </p>
          )}
          <CommandSummary data={d} />
          <nav aria-label="Financial quick actions" className="flex flex-wrap gap-2">
            {d.preferences.quickActions
              .filter((k) =>
                k === 'balance' ? d.owner : !['upload', 'estimate'].includes(k) || d.canManage,
              )
              .map((k) => (
                <Link
                  key={k}
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
                  to={quickDestination(home, k)}
                >
                  {quickLabels[k]}
                </Link>
              ))}
          </nav>
          <CommandActions data={d} />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <CommandObligations data={d} />
            <PaycheckFunding data={d} home={home} />
          </div>
          <CommandTimeline data={d} />
          <details
            className="surface-card rounded-xl border border-white/10 p-4"
            open={d.preferences.expanded.includes('insights')}
          >
            <summary className="cursor-pointer font-semibold">
              Current Financial Insights · {d.insights.length}
            </summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {d.insights.map((i) => (
                <div key={i.id} className="min-w-0 border-l-2 border-sky-400/30 pl-3">
                  <Link to={i.destination} className="text-sm font-medium hover:underline">
                    {i.title}
                  </Link>
                  <p className="mt-1 text-xs text-slate-400">{i.explanation}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {i.priority} · {i.confidence}
                    {i.dismissed ? ' · dismissed risk remains accessible' : ''}
                  </p>
                </div>
              ))}
            </div>
            {!d.insights.length && (
              <p className="mt-3 text-sm text-slate-400">
                More recorded history may be needed for useful insights.
              </p>
            )}
          </details>
          <CommandProgress data={d} home={home} />
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer">Source coverage & assumptions</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {d.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="mt-2">
              Evaluated {new Date(d.evaluatedAt).toLocaleString()}. Planning suggestions do not send
              payments or change records.
            </p>
          </details>
          {settings && (
            <CommandSettings
              data={d}
              home={home}
              close={() => setSettings(false)}
              saved={refresh}
            />
          )}
        </>
      )}
    </div>
  )
}
