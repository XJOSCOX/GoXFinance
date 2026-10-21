import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { forecast, localBillDate, type ForecastData, type ForecastInput } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../../components/ui'
import { apiRequest, errorMessage } from '../../../lib/api'
import { useNotify } from '../../../components/ui/useNotify'
import { SmartTimeline } from '../components/SmartTimeline'
import { SmartEvents } from '../components/SmartEvents'
import { SmartForecastDashboard } from '../components/SmartForecastDashboard'
import { ForecastForm } from '../components/ForecastForm'
import { ForecastResults } from '../components/ForecastResults'
import { formatMoney } from '../../../lib/money'
export function ForecastPage() {
  const { householdId: home = '' } = useParams(),
    [loaded, setData] = useState<(ForecastData & { home: string }) | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [view, setView] = useState('smart'),
    [history, setHistory] = useState(''),
    key = useRef(crypto.randomUUID()),
    notify = useNotify(),
    [input, setInput] = useState<ForecastInput>(() => ({
      name: 'Cash flow scenario',
      startDate: localBillDate(),
      endDate: new Date(Date.parse(localBillDate() + 'T00:00:00Z') + 29 * 86400000)
        .toISOString()
        .slice(0, 10),
      startingCents: null,
      confidence: 'unverified',
      mode: 'expected',
      income: [],
      variableSpendingCents: 0,
      extraDebtCents: 0,
      includeSettlements: false,
      includeUncertainPayouts: false,
      oneTime: [],
    }))
  useEffect(() => {
    let active = true
    void apiRequest<ForecastData>(`households/${home}/forecasts`)
      .then((v) => {
        if (active) {
          setData({ ...v, home })
          setError('')
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    const timer = setInterval(() => setReload((value) => value + 1), 30_000)
    const focus = () => setReload((value) => value + 1)
    window.addEventListener('focus', focus)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', focus)
    }
  }, [home, reload])
  const data = loaded?.home === home ? loaded : null
  let report: ReturnType<typeof forecast> | undefined,
    calculationError = ''
  try {
    if (data)
      report = history
        ? data.scenarios.find((s) => s.id === history)?.report
        : forecast(data.sources, input, localBillDate())
  } catch (e) {
    calculationError = errorMessage(e)
  }
  return (
    <WorkspaceLayout title="Cash flow forecast">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Cash flow forecast</h1>
        <p className="mt-1 text-sm text-slate-400">
          Explore estimates without changing actual transactions. Starting cash is explicit, never
          inferred.
        </p>
      </header>
      {(error || calculationError) && (
        <p role="alert" className="mb-3 text-rose-300">
          {error || calculationError}
          <Button onClick={() => setReload(reload + 1)}>Refresh sources</Button>
        </p>
      )}
      {!data && !error && <p role="status">Loading forecast sources…</p>}
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Forecast mode">
        <Button
          aria-pressed={view === 'smart'}
          variant={view === 'smart' ? 'primary' : 'ghost'}
          onClick={() => setView('smart')}
        >
          Smart forecast
        </Button>
        <Button
          aria-pressed={view === 'custom'}
          variant={view === 'custom' ? 'primary' : 'ghost'}
          onClick={() => setView('custom')}
        >
          Custom scenarios & snapshots
        </Button>
      </div>
      {data && view === 'smart' && (
        <SmartForecastDashboard
          key={home}
          home={home}
          data={data}
          refresh={() => setReload((value) => value + 1)}
        />
      )}
      {data && view === 'custom' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setHistory('')}>Live forecast</Button>
            <Button onClick={() => setReload(reload + 1)}>Refresh sources</Button>
            {data.scenarios.map((s) => (
              <Button key={s.id} onClick={() => setHistory(s.id)}>
                {s.input.name} · {new Date(s.createdAt).toLocaleDateString()}
              </Button>
            ))}
          </div>
          {!history && (
            <ForecastForm
              sources={data.sources}
              initial={input}
              update={(v) => {
                setInput(v)
                key.current = crypto.randomUUID()
              }}
            />
          )}
          {history && (
            <p className="text-sm text-slate-400">
              Saved immutable scenario snapshot ·{' '}
              {data.scenarios.find((s) => s.id === history)?.createdAt}
            </p>
          )}
          {!history && (
            <Card className="overflow-auto p-4">
              <h2 className="mb-2 font-semibold">
                Scenario comparison · uncertain payouts excluded
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {(['conservative', 'expected', 'optimistic'] as const).map((mode) => {
                  let r
                  try {
                    r = forecast(
                      data.sources,
                      { ...input, mode, includeUncertainPayouts: false },
                      localBillDate(),
                    )
                  } catch {
                    return <p key={mode}>Unsupported scenario amounts</p>
                  }
                  return (
                    <div key={mode} className="text-xs">
                      <strong className="capitalize">{mode}</strong>
                      <p className="mt-1">Net change {formatMoney(r.netChangeCents)}</p>
                      <p>
                        Ending cash {formatMoney(r.endingCents)}
                        {r.incomplete ? ' · Incomplete' : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
          {report && <ForecastResults report={report} showChart={!report.smart} />}
          {history && report?.smart && (
            <>
              <SmartTimeline report={report} />
              <SmartEvents home={home} report={report} />
            </>
          )}
          {!history && data.canSave && (
            <Button
              disabled={busy || !!calculationError}
              onClick={async () => {
                if (busy) return
                setBusy(true)
                try {
                  await apiRequest(`households/${home}/forecasts`, {
                    method: 'POST',
                    body: JSON.stringify({
                      idempotencyKey: key.current,
                      fingerprint: data.fingerprint,
                      values: input,
                    }),
                  })
                  notify('success', 'Forecast snapshot saved')
                  setReload(reload + 1)
                  key.current = crypto.randomUUID()
                } catch (e) {
                  setError(errorMessage(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Saving…' : 'Save scenario snapshot'}
            </Button>
          )}
        </div>
      )}
    </WorkspaceLayout>
  )
}
