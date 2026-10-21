import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard } from 'lucide-react'
import {
  debtPlanProblem,
  debtPlanProgress,
  type PlannerData,
  type PlannerRecord,
} from '@goxfinance/shared'
import { apiRequest, errorMessage } from '../../../lib/api'
import { formatMoney } from '../../../lib/money'
import { useLocalToday } from '../../../lib/useLocalToday'
import { Button, Card } from '../../../components/ui'
import { InfoHint } from '../../../components/ui/InfoHint'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { useNotify } from '../../../components/ui/useNotify'
import { PlannerEditor } from '../../smart-planner/components/PlannerEditor'
export function DebtPaymentGoals({
  home,
  createVersion = 0,
}: {
  home: string
  createVersion?: number
}) {
  const navigate = useNavigate()
  const [data, setData] = useState<PlannerData | null>(null),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0),
    [editor, setEditor] = useState<PlannerRecord | null | undefined>()
  const lastCreateVersion = useRef(createVersion)
  useEffect(() => {
    if (createVersion !== lastCreateVersion.current) {
      lastCreateVersion.current = createVersion
      if (createVersion) setEditor(null)
    }
  }, [createVersion])
  const today = useLocalToday(),
    notify = useNotify()
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
    return () => {
      active = false
    }
  }, [home, reload])
  const records =
    data?.records.filter((r) => r.values.kind === 'debt_plan' && r.values.status !== 'cancelled') ??
    []
  return (
    <section className="mb-5 space-y-3" aria-label="Debt payment goals">
      <header className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">
          Debt payment plans{' '}
          <span className="ml-2 font-normal text-slate-500">{records.length}</span>
        </h2>
        <InfoHint
          label="Debt payment plans explained"
          text="Drafts are excluded from Smart Planner until you review and confirm the amount and schedule. Settlement offers do not change the recorded debt balance or mark a debt paid."
        />
      </header>
      {!data && !error && (
        <p role="status" className="text-sm text-slate-400">
          Loading debt payment plans…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      <Card className="divide-y divide-white/[.07]">
        {records.map((r) => {
          if (r.values.kind !== 'debt_plan' || !data) return null
          const v = r.values,
            progress = debtPlanProgress(v, data.sources, today),
            problem = debtPlanProblem(v, data.sources, today)
          return (
            <article
              aria-label={v.name}
              key={r.id}
              className="grid items-center gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(16rem,1.4fr)_minmax(0,1fr)_auto]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="rounded-lg bg-sky-300/5 p-2 text-sky-200">
                  <CreditCard size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{v.name}</h3>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>
                      {v.mode === 'linked_bill' ? 'Schedule through ' : 'Due '}
                      {v.deadline}
                    </span>
                    <StatusBadge status={v.status} tone={problem ? 'warning' : 'positive'} />
                    {problem && <InfoHint label={`${v.name}: review needed`} text={problem} />}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-sm tabular-nums sm:col-span-2 sm:row-start-2 xl:col-span-1 xl:row-start-auto">
                <div>
                  <dt className="text-[11px] text-slate-500">Planned</dt>
                  <dd className="mt-1">{formatMoney(v.amountCents)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Paid</dt>
                  <dd className="mt-1 text-emerald-300">{formatMoney(progress.paidCents)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Remaining</dt>
                  <dd className="mt-1">{formatMoney(progress.remainingCents)}</dd>
                </div>
              </dl>
              <div className="flex items-center justify-end gap-1 sm:col-start-2 sm:row-start-1 xl:col-start-auto xl:row-start-auto">
                {r.canManage && (
                  <Button size="small" onClick={() => setEditor(r)}>
                    {r.requiresApproval ? 'Request edit' : 'Review'}
                  </Button>
                )}
                <ActionMenu
                  label={`Actions for debt goal ${v.name}`}
                  items={[
                    {
                      label: 'View in Smart Planner',
                      onSelect: () => navigate(`/households/${home}/planner?record=${r.id}`),
                    },
                  ]}
                />
              </div>
            </article>
          )
        })}
      </Card>
      {data && !records.length && (
        <p className="text-sm text-slate-400">
          No confirmed debt schedules or dated payoff goals yet.
        </p>
      )}
      {editor !== undefined && data && (
        <PlannerEditor
          home={home}
          data={data}
          kind="debt_plan"
          record={editor ?? undefined}
          close={() => setEditor(undefined)}
          saved={(requested) => {
            setEditor(undefined)
            setReload((n) => n + 1)
            notify('success', requested ? 'Requested Owner approval' : 'Debt payment goal saved')
          }}
        />
      )}
    </section>
  )
}
