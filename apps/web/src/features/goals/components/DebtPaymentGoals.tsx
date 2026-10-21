import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { useNotify } from '../../../components/ui/useNotify'
import { PlannerEditor } from '../../smart-planner/components/PlannerEditor'
export function DebtPaymentGoals({ home }: { home: string }) {
  const [data, setData] = useState<PlannerData | null>(null),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0),
    [editor, setEditor] = useState<PlannerRecord | null | undefined>()
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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Debt payment goals</h2>
          <p className="text-xs text-slate-400">
            Review settlement amounts and monthly arrangements before including them in Smart
            Planner.
          </p>
        </div>
        {data?.canManage && <Button onClick={() => setEditor(null)}>Plan debt payment</Button>}
      </header>
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {records.map((r) => {
          if (r.values.kind !== 'debt_plan' || !data) return null
          const v = r.values,
            progress = debtPlanProgress(v, data.sources, today),
            problem = debtPlanProblem(v, data.sources, today)
          return (
            <Card className="space-y-3 p-4" key={r.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-semibold">{v.name}</h3>
                <span className={problem ? 'text-xs text-amber-200' : 'text-xs text-emerald-200'}>
                  {v.status}
                </span>
              </div>
              <p className="text-sm">
                {v.mode === 'linked_bill' ? 'Monthly bill schedule through ' : 'Pay by '}
                {v.deadline}
              </p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Planned total</p>
                  {formatMoney(v.amountCents)}
                </div>
                <div>
                  <p className="text-xs text-slate-400">Actually paid</p>
                  {formatMoney(progress.paidCents)}
                </div>
                <div>
                  <p className="text-xs text-slate-400">Goal remaining</p>
                  {formatMoney(progress.remainingCents)}
                </div>
              </div>
              {problem && <p className="text-xs text-amber-200">{problem}</p>}
              <div className="flex flex-wrap gap-3">
                {r.canManage && (
                  <Button size="small" onClick={() => setEditor(r)}>
                    {r.requiresApproval ? 'Request edit' : 'Review / confirm'}
                  </Button>
                )}
                <Link
                  className="text-xs text-slate-300 underline"
                  to={`/households/${home}/planner?record=${r.id}`}
                >
                  View in Smart Planner
                </Link>
              </div>
            </Card>
          )
        })}
      </div>
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
