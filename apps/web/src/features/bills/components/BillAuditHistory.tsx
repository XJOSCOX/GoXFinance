import { useEffect, useState } from 'react'
import type { BillAuditEntry } from '@goxfinance/shared'
import { errorMessage } from '../../../lib/api'
import { getBill } from '../api/billClient'
export function BillAuditHistory({
  home,
  billId,
  revision,
}: {
  home: string
  billId: string
  revision: number
}) {
  const [audit, setAudit] = useState<BillAuditEntry[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void getBill(home, billId)
      .then((result) => {
        if (active) setAudit(result.audit)
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure))
      })
    return () => {
      active = false
    }
  }, [home, billId, revision])
  return (
    <details className="border-t border-white/10 pt-4 text-sm">
      <summary className="cursor-pointer text-slate-400">Audit history</summary>
      <div className="mt-3 space-y-3">
        {audit.map((item) => (
          <details key={item.id}>
            <summary className="cursor-pointer">
              {item.action.replaceAll('_', ' ')} · {new Date(item.createdAt).toLocaleString()}
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-400">
              {JSON.stringify(
                {
                  actor: item.actorUserId,
                  before: item.beforeJson ? JSON.parse(item.beforeJson) : null,
                  after: item.afterJson ? JSON.parse(item.afterJson) : null,
                },
                null,
                2,
              )}
            </pre>
          </details>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-rose-300">
          {error}
        </p>
      )}
    </details>
  )
}
