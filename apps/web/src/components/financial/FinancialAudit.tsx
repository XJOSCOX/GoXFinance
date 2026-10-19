import { useEffect, useState } from 'react'
import type { FinancialAudit as Audit } from '@goxfinance/shared'
import { apiRequest, errorMessage } from '../../lib/api'
import { Modal } from '../ui/Modal'
export function FinancialAudit({ path, close }: { path: string; close: () => void }) {
  const [data, setData] = useState<Audit[] | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    apiRequest<{ audit: Audit[] }>(path)
      .then((v) => {
        if (active) setData(v.audit)
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [path])
  return (
    <Modal title="Audit history" onClose={close}>
      <div className="space-y-3">
        {error && <p role="alert">{error}</p>}
        {data === null && !error && <p role="status">Loading history...</p>}
        {data?.map((entry) => (
          <details key={entry.id} className="rounded-lg border border-white/10 p-3">
            <summary className="cursor-pointer text-sm">
              {entry.action.replaceAll('_', ' ')} / {new Date(entry.createdAt).toLocaleString()}
            </summary>
            <p className="mt-2 break-all text-xs text-slate-400">Actor: {entry.actorUserId}</p>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(
                {
                  before: entry.beforeJson ? JSON.parse(entry.beforeJson) : null,
                  after: entry.afterJson ? JSON.parse(entry.afterJson) : null,
                },
                null,
                2,
              )}
            </pre>
          </details>
        ))}
      </div>
    </Modal>
  )
}
