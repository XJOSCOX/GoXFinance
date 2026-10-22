import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Wallet, ShieldAlert, CalendarClock, PiggyBank } from 'lucide-react'
import {
  smartPlanner,
  smartForecastInput,
  type PlannerData,
  type PlannerRecord,
  type PlannerInput,
  type ForecastInput,
} from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { apiRequest, errorMessage } from '../../../lib/api'
import { useLocalToday } from '../../../lib/useLocalToday'
import { useNotify } from '../../../components/ui/useNotify'
import { formatMoney } from '../../../lib/money'
import { OpeningCashForm } from '../../forecasts/components/OpeningCashForm'
import { SmartWhatIf } from '../../forecasts/components/SmartWhatIf'
import { SmartTimeline } from '../../forecasts/components/SmartTimeline'
import { SmartEvents } from '../../forecasts/components/SmartEvents'
import { PlannerEditor } from '../components/PlannerEditor'
import { AvailableBalanceForm } from '../components/AvailableBalanceForm'
import { RecommendedPlan } from '../components/RecommendedPlan'
import { PlanningRecords } from '../components/PlanningRecords'
import { PlannerScenario } from '../components/PlannerScenario'
export function SmartPlannerPage() {
  const { householdId = '' } = useParams()
  return <Planner key={householdId} home={householdId} />
}
function Planner({ home }: { home: string }) {
  const [search] = useSearchParams()
  const [data, setData] = useState<PlannerData | null>(null),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0),
    [days, setDays] = useState(30),
    [view, setView] = useState(
      search.has('record') || search.has('debtGoals') ? 'records' : 'plan',
    ),
    [editor, setEditor] = useState<{
      kind: Exclude<PlannerInput['kind'], 'balance'>
      record?: PlannerRecord
      initial?: Partial<Extract<PlannerInput, { kind: 'allocation' }>>
    }>(),
    [balance, setBalance] = useState(search.get('action') === 'balance'),
    [opening, setOpening] = useState(search.get('action') === 'cash'),
    [draft, setDraft] = useState<ForecastInput | null>(null),
    [history, setHistory] = useState(''),
    [busy, setBusy] = useState(false),
    [resetVersion, setResetVersion] = useState(0)
  const today = useLocalToday(),
    notify = useNotify(),
    key = useRef(crypto.randomUUID()),
    saving = useRef(false)
  const refresh = () => setReload((n) => n + 1)
  useEffect(() => {
    let active = true
    void apiRequest<PlannerData>(`households/${home}/planner`)
      .then((d) => {
        if (active) {
          setData(d)
          setError('')
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    const timer = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [home, reload])
  const savedInput = data?.snapshots.find((s) => s.id === history)?.input
  const base = smartForecastInput(data?.settings ?? null, today, days),
    input =
      history && savedInput
        ? savedInput
        : draft
          ? {
              ...draft,
              startDate: base.startDate,
              endDate: base.endDate,
              startingCents: base.startingCents,
              smart: {
                ...draft.smart!,
                opening: base.smart!.opening,
                settingsVersionId: base.smart!.settingsVersionId,
              },
            }
          : base
  let report,
    baseline,
    calculationError = ''
  try {
    if (data) {
      baseline = smartPlanner(data.sources, base, today)
      report = history
        ? data.snapshots.find((s) => s.id === history)?.report
        : smartPlanner(data.sources, input, today)
    }
  } catch (e) {
    calculationError = errorMessage(e)
  }
  const changed = (v: ForecastInput) => {
    setDraft(v)
    key.current = crypto.randomUUID()
    setHistory('')
  }
  return (
    <WorkspaceLayout title="Smart Planner">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Smart Planner</h1>
          <p className="mt-1 text-sm text-slate-400">
            Know what is available, what needs attention, and what depends on payday.
          </p>
        </div>
        {data?.canManage && !history && (
          <div className="flex flex-wrap gap-2">
            {data.owner && (
              <Button onClick={() => setBalance(true)}>Update available balance</Button>
            )}
            <Button variant="primary" onClick={() => setOpening(true)}>
              Confirm cash / buffer
            </Button>
          </div>
        )}
      </header>
      {(error || calculationError) && (
        <p role="alert" className="mb-4 text-rose-300">
          {error || calculationError}
          <Button onClick={refresh}>Refresh</Button>
        </p>
      )}
      {!data && !error && <p role="status">Loading your planning sources…</p>}
      {data && report && baseline && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Planning range">
              {[7, 14, 30, 60, 90].map((n) => (
                <Button
                  size="small"
                  key={n}
                  aria-pressed={days === n}
                  variant={days === n ? 'primary' : 'ghost'}
                  onClick={() => {
                    setDays(n)
                    setHistory('')
                    key.current = crypto.randomUUID()
                  }}
                >
                  {n} days
                </Button>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              {input.smart?.opening
                ? `Cash confirmed ${new Date(input.smart!.opening!.effectiveAt).toLocaleString()}`
                : 'Confirm available cash to complete the plan'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                name: 'Confirmed available cash',
                amount: input.smart?.opening?.amountCents ?? null,
                icon: Wallet,
                color: 'text-emerald-300',
                note: 'Before planning reserves · not expected payroll',
              },
              {
                name: 'Expected paychecks',
                amount: report.funding
                  .filter(
                    (f) => f.status !== 'confirmed_cash' && f.status !== 'hypothetical_borrowing',
                  )
                  .reduce((n, f) => n + f.amountCents, 0),
                icon: CalendarClock,
                color: 'text-sky-300',
                note: 'Conditional · not yet spendable',
              },
              {
                name: 'Protected reserves',
                amount: report.reservedCents,
                icon: PiggyBank,
                color: 'text-violet-300',
                note: 'Safety buffer, living costs and accepted reserves',
              },
              {
                name: 'Unfunded by deadlines',
                amount: report.unfundedCents,
                icon: ShieldAlert,
                color: report.unfundedCents ? 'text-rose-300' : 'text-emerald-300',
                note: `${report.unknownCount} unknown obligations · ${report.fullyFunded ? 'Known plan funded' : 'Review assumptions / missing information'}`,
              },
            ].map((m) => (
              <Card key={m.name} className="p-4">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span>{m.name}</span>
                  <m.icon size={16} className={m.color} />
                </div>
                <strong className={'mt-2 block text-xl ' + m.color}>{formatMoney(m.amount)}</strong>
                <p className="mt-1 text-[11px] text-slate-400">{m.note}</p>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-white/10 px-4 py-3 text-xs text-slate-400">
            <span>
              Critical due{' '}
              <strong className="text-rose-300">
                {formatMoney(
                  report.items
                    .filter((i) => i.priority === 'critical')
                    .reduce((n, i) => n + (i.amountCents ?? 0), 0),
                )}
              </strong>
            </span>
            <span>
              Essential due{' '}
              <strong className="text-amber-300">
                {formatMoney(
                  report.items
                    .filter((i) => i.priority === 'essential')
                    .reduce((n, i) => n + (i.amountCents ?? 0), 0),
                )}
              </strong>
            </span>
            <span>
              Cash after reserves{' '}
              <strong className="text-emerald-300">
                {formatMoney(report.confirmedSpendableCents)}
              </strong>
            </span>
            <span>
              Advance / installment costs <strong>{formatMoney(report.feesCents)}</strong>
            </span>
          </div>
          <div
            className="flex flex-wrap gap-2 border-b border-white/10 pb-3"
            role="group"
            aria-label="Planner section"
          >
            {[
              ['plan', 'Recommended plan'],
              ['calendar', 'Calendar & scenarios'],
              ['records', 'Terms & allocations'],
              ['insights', 'Insights & history'],
            ].map(([value, label]) => (
              <Button
                key={value}
                size="small"
                variant={view === value ? 'primary' : 'ghost'}
                onClick={() => setView(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {report.warnings.length > 0 && (
            <details className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
              <summary className="cursor-pointer text-sm text-amber-200">
                {report.warnings.length} planning notes
                {report.forecast.incomplete
                  ? ' · unresolved information; known amounts only'
                  : ' · assumptions and cautions'}
              </summary>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-xs text-slate-400">
                {report.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {history && (
            <p className="text-sm text-sky-300">
              Viewing an immutable saved plan.{' '}
              <Button size="small" onClick={() => setHistory('')}>
                Return to current sources
              </Button>
            </p>
          )}
          {view === 'plan' && (
            <RecommendedPlan
              report={report}
              manage={data.canManage && !history}
              allocate={(initial) => setEditor({ kind: 'allocation', initial })}
            />
          )}
          {view === 'calendar' && (
            <>
              <SmartTimeline report={report.forecast} />
              <SmartWhatIf
                key={resetVersion}
                input={input}
                baseline={baseline.forecast}
                report={report.forecast}
                sources={data.sources}
                update={changed}
                reset={() => {
                  setDraft(null)
                  setResetVersion((n) => n + 1)
                  setHistory('')
                  key.current = crypto.randomUUID()
                }}
              />
              <PlannerScenario
                key={resetVersion}
                input={input}
                report={report}
                baseline={baseline}
                update={changed}
              />
              <SmartEvents home={home} report={report.forecast} />
            </>
          )}
          {view === 'records' && (
            <>
              {data.canManage && (
                <div className="flex flex-wrap gap-2">
                  <FormField label="Add planning terms">
                    <Select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          const kind = e.target.value as Exclude<PlannerInput['kind'], 'balance'>
                          setEditor({
                            kind,
                            record:
                              kind === 'preferences'
                                ? data.records.find((r) => r.values.kind === 'preferences')
                                : undefined,
                          })
                        }
                      }}
                    >
                      <option value="">Choose an action…</option>
                      <option value="priority">Set obligation priority</option>
                      <option value="debt_plan">Confirm debt plan / payoff goal</option>
                      <option value="arrangement">Add split / BNPL arrangement</option>
                      <option value="advance">Track an existing cash advance</option>
                      <option value="allocation">Reserve money / link a goal</option>
                      {data.owner && <option value="preferences">Living reserves & budgets</option>}
                    </Select>
                  </FormField>
                </div>
              )}
              <PlanningRecords
                home={home}
                data={data}
                today={today}
                edit={(r) =>
                  r.values.kind !== 'balance' && setEditor({ kind: r.values.kind, record: r })
                }
                refresh={() => {
                  refresh()
                  notify('success', 'Planning decision saved')
                }}
              />
            </>
          )}
          {view === 'insights' && (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                {report.insights.map((i, n) => (
                  <Card className="p-4" key={n}>
                    <h2 className="font-semibold text-amber-200">{i.title}</h2>
                    <p className="mt-2 text-sm text-slate-300">{i.reason}</p>
                    <ul className="mt-3 list-disc space-y-2 pl-4 text-xs text-slate-400">
                      {i.actions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
              <Card className="p-4">
                <h2 className="font-semibold">Local patterns</h2>
                {!report.patterns.length && (
                  <p className="mt-2 text-sm text-slate-400">
                    At least three completed bill periods, recorded months, or confirmed paychecks
                    are needed. No other household’s records are used.
                  </p>
                )}
                {report.patterns.map((p, i) => (
                  <div className="mt-3 border-t border-white/10 pt-3 text-sm" key={i}>
                    <strong>
                      {p.name} ·{' '}
                      {p.amountCents === null ? 'Timing pattern' : formatMoney(p.amountCents)}
                    </strong>
                    <p className="mt-1 text-xs text-slate-400">
                      {p.sampleCount} samples · {p.confidence} confidence · {p.basis}
                    </p>
                  </div>
                ))}
              </Card>
              <Card className="space-y-3 p-4">
                <h2 className="font-semibold">Saved plans</h2>
                {data.snapshots.map((s) => (
                  <Button
                    key={s.id}
                    onClick={() => {
                      setHistory(s.id)
                      setView('plan')
                    }}
                  >
                    {s.name} · {new Date(s.createdAt).toLocaleDateString()}
                  </Button>
                ))}
                {data.canManage && !history && (
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      if (saving.current) return
                      saving.current = true
                      setBusy(true)
                      try {
                        await apiRequest(`households/${home}/planner/snapshots`, {
                          method: 'POST',
                          body: JSON.stringify({
                            values: input,
                            fingerprint: data.fingerprint,
                            idempotencyKey: key.current,
                          }),
                        })
                        notify('success', 'Plan snapshot saved')
                        refresh()
                        key.current = crypto.randomUUID()
                      } catch (e) {
                        setError(errorMessage(e))
                        notify('error', errorMessage(e))
                      } finally {
                        setBusy(false)
                        saving.current = false
                      }
                    }}
                  >
                    {busy ? 'Saving…' : 'Save this planning scenario'}
                  </Button>
                )}
              </Card>
            </>
          )}
          <p className="text-xs text-slate-500">
            Planning only. No payments are sent. Priorities reflect verified terms and household
            preferences, not universal legal rankings.{' '}
            <Link className="text-slate-300 underline" to={`/households/${home}/bills`}>
              Bills
            </Link>{' '}
            ·{' '}
            <Link className="text-slate-300 underline" to={`/households/${home}/forecasts`}>
              Cash flow
            </Link>
          </p>
          {editor && (
            <PlannerEditor
              home={home}
              data={data}
              {...editor}
              close={() => setEditor(undefined)}
              saved={(requested) => {
                refresh()
                notify(
                  'success',
                  requested ? 'Request submitted to the Owner' : 'Planning record saved',
                )
              }}
            />
          )}
          {balance && data.owner && (
            <AvailableBalanceForm
              home={home}
              accounts={data.sources.cashAccounts ?? []}
              events={report.forecast.events}
              close={() => setBalance(false)}
              saved={() => {
                refresh()
                notify(
                  'success',
                  'Available balance saved. Confirm cash to include it in your plan.',
                )
              }}
            />
          )}
          {opening && data.canManage && (
            <OpeningCashForm
              home={home}
              data={{ ...data, canSave: data.canManage, scenarios: [] }}
              close={() => setOpening(false)}
              saved={() => {
                refresh()
                setOpening(false)
                notify('success', 'Cash confirmation saved')
              }}
            />
          )}
        </div>
      )}
    </WorkspaceLayout>
  )
}
