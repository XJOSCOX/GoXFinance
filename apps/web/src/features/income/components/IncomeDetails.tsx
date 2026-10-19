import { useEffect, useState } from 'react'
import {
  incomeTypeLabels,
  type IncomeSource,
  type IncomeTransaction,
  type IncomeAudit,
} from '@goxfinance/shared'
import { Modal } from '../../../components/ui/Modal'
import { incomeDetails } from '../api/incomeClient'
import { formatMoney } from '../../../lib/money'
import { errorMessage } from '../../../lib/api'
export function IncomeDetails({
  home,
  source,
  transactions,
  close,
}: {
  home: string
  source: IncomeSource
  transactions: IncomeTransaction[]
  close: () => void
}) {
  const [audit, setAudit] = useState<IncomeAudit[] | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void incomeDetails(home, source.id)
      .then((v) => {
        if (active) setAudit(v.audit)
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [home, source.id])
  return (
    <Modal title={source.name} onClose={close} className="max-w-3xl">
      <p className="text-sm text-slate-400">
        {incomeTypeLabels[source.incomeType]} · Source revision {source.revision}
      </p>
      {source.notes && <p className="mt-3 text-sm">{source.notes}</p>}
      <h3 className="mt-6 font-semibold">Paycheck details</h3>
      <div className="mt-3 space-y-4">
        {transactions
          .filter((v) => v.sourceId === source.id)
          .map((v) => (
            <div key={v.id} className="rounded-lg border border-white/10 p-4 text-sm">
              <p>
                {v.payDate} · {v.status} · Revision {v.revision}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Work period {v.workPeriodStart ?? 'Unknown'} – {v.workPeriodEnd ?? 'Unknown'}
                <br />
                Regular hours {v.regularHours ?? 'Unknown'} · Overtime{' '}
                {v.overtimeHours ?? 'Unknown'} · Rate {formatMoney(v.hourlyRateCents)} · Multiplier{' '}
                {v.overtimeMultiplier}
                <br />
                Estimated gross {formatMoney(v.estimatedGrossCents)} · Actual gross{' '}
                {formatMoney(v.actualGrossCents)}
                <br />
                Deductions {formatMoney(v.deductionsCents)} · Net {formatMoney(v.actualNetCents)}
                <br />
                Deposit {v.depositDate ?? 'Not confirmed'} · Confirmed at{' '}
                {v.confirmedAt ?? 'Not confirmed'}
                <br />
                Reference {v.reference ?? 'None'}
              </p>
              {v.notes && <p className="mt-2">{v.notes}</p>}
            </div>
          ))}
      </div>
      <h3 className="mt-6 font-semibold">Audit history</h3>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      ) : audit ? (
        <div className="mt-3 space-y-2">
          {audit.map((v) => (
            <details key={v.id} className="rounded-lg border border-white/10 p-3 text-xs">
              <summary className="cursor-pointer">
                {v.action.replaceAll('_', ' ')} · {v.createdAt}
              </summary>
              <p className="mt-2 break-all text-slate-400">Actor {v.actorUserId}</p>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-slate-400">
                {JSON.stringify(
                  {
                    before: v.beforeJson ? JSON.parse(v.beforeJson) : null,
                    after: v.afterJson ? JSON.parse(v.afterJson) : null,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          ))}
        </div>
      ) : (
        <p role="status" className="mt-3">
          Loading history…
        </p>
      )}
    </Modal>
  )
}
