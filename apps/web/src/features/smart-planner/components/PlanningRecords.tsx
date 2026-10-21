import { useSearchParams } from 'react-router-dom'
import { useState, useRef } from 'react'
import type { PlannerData, PlannerRecord, ForecastSources } from '@goxfinance/shared'
import {
  plannerPaymentTotals,
  plannerInstallmentCents,
  advancePaymentLinks,
  debtPlanProgress,
  debtPlanProblem,
} from '@goxfinance/shared'
import { Button, Card, Input } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { apiRequest, errorMessage } from '../../../lib/api'
export function PlanningRecords({
  home,
  data,
  today,
  edit,
  refresh,
}: {
  home: string
  data: PlannerData
  today: string
  edit: (r: PlannerRecord) => void
  refresh: () => void
}) {
  const [search] = useSearchParams()
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [audit, setAudit] = useState<unknown[]>([]),
    [reason, setReason] = useState(''),
    pending = useRef(false)
  async function review(id: string, decision: string) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      await apiRequest(`households/${home}/planner/requests/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, reason, idempotencyKey: crypto.randomUUID() }),
      })
      setError('')
      refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
      pending.current = false
    }
  }
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-rose-300">
          {error}
        </p>
      )}
      {data.requests.some((r) => r.status === 'pending') && (
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">Owner approval requests</h2>
          <Input
            aria-label="Review reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for approval, rejection, or cancellation"
          />
          {data.requests
            .filter((r) => r.status === 'pending')
            .map((r) => (
              <div className="space-y-2 border-t border-white/10 pt-3" key={r.id}>
                <strong>{r.values.name}</strong>
                <p className="text-xs text-slate-400">
                  {r.reason} · submitted {r.createdAt}
                </p>
                <details>
                  <summary className="cursor-pointer text-sm">Review proposed details</summary>
                  <p className="mt-2 text-sm">
                    Type: {r.values.kind} · {r.values.notes}
                  </p>
                  <RecordDetails value={r.values} sources={data.sources} today={today} />
                </details>
                <div className="flex gap-2">
                  {data.owner ? (
                    <>
                      <Button
                        disabled={busy || !reason.trim()}
                        onClick={() => void review(r.id, 'approved')}
                      >
                        Approve
                      </Button>
                      <Button
                        disabled={busy || !reason.trim()}
                        onClick={() => void review(r.id, 'rejected')}
                      >
                        Confirm rejection
                      </Button>
                    </>
                  ) : (
                    <Button
                      disabled={busy || !reason.trim()}
                      onClick={() => void review(r.id, 'cancelled')}
                    >
                      Cancel request
                    </Button>
                  )}
                </div>
              </div>
            ))}
        </Card>
      )}
      <Card className="divide-y divide-white/10">
        {!data.records.length && (
          <p className="p-5 text-sm text-slate-400">
            No saved priorities or arrangements yet. Your existing obligations already appear in the
            plan.
          </p>
        )}
        {data.records.map((r) => (
          <details key={r.id} open={search.get('record') === r.id || undefined} className="p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {r.values.name}
              <span className="ml-2 text-xs text-slate-400">
                {r.values.kind} · revision {r.revision}
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-slate-400">{r.values.notes}</p>
              <RecordDetails value={r.values} sources={data.sources} today={today} />
              <div className="flex gap-2">
                {r.canManage && r.values.kind !== 'balance' && (
                  <Button size="small" onClick={() => edit(r)}>
                    {r.requiresApproval ? 'Request edit' : 'Edit'}
                  </Button>
                )}
                <Button
                  size="small"
                  onClick={async () => {
                    try {
                      const result = await apiRequest<{ history: unknown[] }>(
                        `households/${home}/planner/records/${r.id}/audit`,
                      )
                      setAudit(result.history)
                      setError('')
                    } catch (e) {
                      setError(errorMessage(e))
                    }
                  }}
                >
                  Audit history
                </Button>
              </div>
            </div>
          </details>
        ))}
      </Card>
      {audit.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 font-semibold">Planning audit</h3>
          {(
            audit as {
              id: string
              action: string
              createdAt: string
              details: { reason?: string }
            }[]
          ).map((a) => (
            <p key={a.id} className="mb-2 text-xs">
              {a.createdAt} · {a.action.replaceAll('_', ' ')} · {a.details.reason ?? ''}
            </p>
          ))}
        </Card>
      )}
    </div>
  )
}
function RecordDetails({
  value: v,
  sources,
  today,
}: {
  value: PlannerRecord['values']
  sources: ForecastSources
  today: string
}) {
  if (v.kind === 'debt_plan') {
    const progress = debtPlanProgress(v, sources, today),
      problem = debtPlanProblem(v, sources, today)
    return (
      <div className="space-y-2 text-xs">
        <p>
          {v.status} · {v.mode === 'linked_bill' ? 'Existing monthly bill' : 'Pay by ' + v.deadline}{' '}
          · {v.startDate}–{v.deadline}
        </p>
        <p>
          Target {formatMoney(v.amountCents)} · actually paid {formatMoney(progress.paidCents)} ·
          remaining goal {formatMoney(progress.remainingCents)}
        </p>
        <p>
          {v.replaceOriginal
            ? 'Provider-confirmed replacement schedule'
            : 'Personal target; contractual obligations remain unchanged'}
        </p>
        {problem && <p className="text-amber-200">{problem}</p>}
      </div>
    )
  }
  if (v.kind === 'arrangement')
    return (
      <div className="space-y-2 text-xs">
        <p>
          {v.status} ·{' '}
          {v.verification.verified
            ? 'Verified terms: ' + v.verification.source
            : 'Unverified · original obligation remains due'}
        </p>
        <p>
          Original {formatMoney(v.originalCents)} · financed {formatMoney(v.financedCents)} · down
          payment {formatMoney(v.downPaymentCents)}
        </p>
        {v.installments.map((i) => {
          const p = plannerPaymentTotals(i.payments, sources, today),
            total = plannerInstallmentCents(i)
          return (
            <p key={i.id}>
              {i.date} · {formatMoney(total)} · paid {formatMoney(p.paidCents)} · pending{' '}
              {formatMoney(p.pendingCents)} · scheduled {formatMoney(p.scheduledCents)} · remaining{' '}
              {formatMoney(Math.max(0, total - p.paidCents))}
              {i.date < today && p.paidCents < total ? ' · overdue' : ''}
            </p>
          )
        })}
      </div>
    )
  if (v.kind === 'advance') {
    const p = plannerPaymentTotals(advancePaymentLinks(v, sources), sources, today)
    return (
      <div className="space-y-2 text-xs">
        <p>
          {v.status} · {v.provider} ·{' '}
          {v.received ? 'Received ' + formatMoney(v.receivedCents) : 'Receipt unconfirmed'}
        </p>
        <p>
          Principal {formatMoney(v.principalCents)} · fees {formatMoney(v.feesCents)} · tips{' '}
          {formatMoney(v.tipsCents)} · expedite {formatMoney(v.expeditedCents)}
        </p>
        <p>
          Total advance costs {formatMoney(v.feesCents + v.tipsCents + v.expeditedCents)}
          {v.principalCents > 0
            ? ` · ${(((v.feesCents + v.tipsCents + v.expeditedCents) / v.principalCents) * 100).toFixed(2)}% of principal (not APR)`
            : ''}
        </p>
        <p>
          Repayment {formatMoney(v.repaymentCents)} on {v.repaymentDate} ·{' '}
          {v.repaymentMethod.replaceAll('_', ' ')} · {v.autoDebit ? 'auto debit' : 'manual'}
        </p>
        <p>
          {v.repaymentMethod === 'payroll_deduction'
            ? `Payroll repayment confirmed ${formatMoney(v.payrollRepaidCents)} · remaining ${formatMoney(Math.max(0, v.repaymentCents - v.payrollRepaidCents))}; net is not charged again. Reconcile the linked debt balance separately.`
            : 'Remaining ' +
              formatMoney(Math.max(0, v.repaymentCents - p.paidCents)) +
              ' · pending ' +
              formatMoney(p.pendingCents) +
              ' · scheduled ' +
              formatMoney(p.scheduledCents)}
        </p>
      </div>
    )
  }
  if (v.kind === 'priority')
    return (
      <p className="text-xs">
        {v.priority} ·{' '}
        {v.verification.verified
          ? 'Verified ' + v.consequence + ' · ' + v.verification.source
          : 'No verified consequence'}{' '}
        · {v.deadline ?? 'Original due date'}
      </p>
    )
  if (v.kind === 'allocation')
    return (
      <p className="text-xs">
        {v.status} · {formatMoney(v.amountCents)} · {v.date} · {v.purpose.replaceAll('_', ' ')} ·{' '}
        {v.explanation}
      </p>
    )
  if (v.kind === 'preferences')
    return (
      <p className="text-xs">
        Living reserve {formatMoney(v.essentialReserveCents)} · category budget reserves{' '}
        {v.useBudgetReserves ? 'enabled' : 'disabled'}
      </p>
    )
  return (
    <p className="text-xs">
      {v.effectiveAt} · {v.timezone} · {v.source.replaceAll('_', ' ')} · pending included:{' '}
      {v.pendingIncluded}
    </p>
  )
}
