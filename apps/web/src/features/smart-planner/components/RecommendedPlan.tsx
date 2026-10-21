import type { PlannerReport, PlannerInput } from '@goxfinance/shared'
import { Card, Button } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
const colors = {
  critical: 'text-rose-300 bg-rose-400/10',
  essential: 'text-amber-300 bg-amber-400/10',
  important: 'text-sky-300 bg-sky-400/10',
  flexible: 'text-violet-300 bg-violet-400/10',
  optional: 'text-slate-300 bg-white/5',
}
const fundingLabel = {
  confirmed_cash: 'Available cash',
  documented_paycheck: 'Awaiting documented deposit',
  forecast_paycheck: 'Awaiting forecast paycheck',
  assumed_paycheck: 'Assumed paycheck',
  hypothetical_borrowing: 'Hypothetical borrowing',
}
export function RecommendedPlan({
  report,
  manage,
  allocate,
}: {
  report: PlannerReport
  manage: boolean
  allocate: (initial: Partial<Extract<PlannerInput, { kind: 'allocation' }>>) => void
}) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="border-b border-white/10 p-4">
        <h2 className="font-semibold">Recommended plan</h2>
        <p className="mt-1 text-xs text-slate-400">
          Reserve amounts are proposals. Expected paychecks stay conditional until received.
        </p>
      </div>
      {!report.items.length && (
        <p className="p-6 text-sm text-slate-400">
          No known unpaid obligations in this range. Add bills or debt minimums to build your plan.
        </p>
      )}
      <div className="divide-y divide-white/10">
        {report.items.map((i) => (
          <details key={i.id} className="group p-4">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      'rounded px-2 py-1 text-[10px] font-semibold uppercase ' + colors[i.priority]
                    }
                  >
                    {i.priority}
                  </span>
                  <h3 className="break-words text-sm font-semibold">{i.name}</h3>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Due {i.date} · {i.dismissed ? 'Dismissed · still owed' : i.confidence} · expand
                  for explanation
                </p>
              </div>
              <div className="text-right text-sm">
                <strong>{formatMoney(i.amountCents)} due</strong>
                <p className={i.unfundedCents ? 'text-rose-300' : 'text-emerald-300'}>
                  {formatMoney(i.recommendedCents)} reserved · {formatMoney(i.unfundedCents)}{' '}
                  unfunded
                </p>
              </div>
            </summary>
            <div className="mt-4 grid gap-4 text-xs lg:grid-cols-2">
              <div>
                <h4 className="mb-2 font-semibold">Funding / recommended dates</h4>
                {i.funding.map((f) => (
                  <p key={f.id} className="mb-2">
                    {f.date} · {formatMoney(f.amountCents)} · {fundingLabel[f.status]}
                    <span className="block text-slate-400">{f.name}</span>
                  </p>
                ))}
                {!i.funding.length && (
                  <p className="text-rose-300">No confirmed on-time funding identified.</p>
                )}
              </div>
              <ul className="list-disc space-y-2 pl-4 text-slate-400">
                {i.reason.map((r, n) => (
                  <li key={n}>{r}</li>
                ))}
              </ul>
            </div>
            {i.consequence && (
              <p className="mt-2 text-xs text-amber-300">Verified consequence: {i.consequence}</p>
            )}
            {manage && i.target && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="small"
                  onClick={() =>
                    allocate({
                      name: i.name + ' allocation',
                      target: i.target,
                      purpose: 'obligation',
                      amountCents: i.recommendedCents,
                      date: i.date,
                      priority: i.priority,
                      status: 'accepted',
                      explanation: 'Reviewed suggested funding and deadline',
                    })
                  }
                >
                  Accept / adjust allocation
                </Button>
                <Button
                  size="small"
                  onClick={() =>
                    allocate({
                      name: i.name + ' review',
                      target: i.target,
                      purpose: 'obligation',
                      amountCents: 0,
                      date: i.date,
                      priority: i.priority,
                      status: 'dismissed',
                      explanation: '',
                    })
                  }
                >
                  Dismiss with reason
                </Button>
              </div>
            )}
          </details>
        ))}
      </div>
    </Card>
  )
}
