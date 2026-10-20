import type { BankAudit, BankBalance } from '@goxfinance/shared'
import { Modal } from '../../../components/ui/Modal'
import { useBanking } from '../hooks/useBanking'
import { BankAmount } from './BankAmount'
export function BankHistory({
  home,
  id,
  currency,
  close,
}: {
  home: string
  id: string
  currency: string | null
  close: () => void
}) {
  const { data, error } = useBanking<{ audit: BankAudit[]; balances: BankBalance[] }>(
    home,
    `/accounts/${id}/audit`,
  )
  return (
    <Modal title="Account history" onClose={close}>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading history…</p>}
      {data && (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 font-semibold">Balance observations</h2>
            {!data.balances.length && (
              <p className="text-sm text-slate-400">No observations recorded.</p>
            )}
            {data.balances.map((b) => (
              <div
                key={b.id}
                className="flex justify-between gap-4 border-b border-white/10 py-2 text-sm"
              >
                <div>
                  {new Date(b.observedAt).toLocaleString()}
                  <p className="text-xs text-slate-400">
                    {b.source === 'manual' ? 'Manually observed' : 'Provider cached balance'}
                    {b.notes ? ` · ${b.notes}` : ''}
                  </p>
                </div>
                <strong>
                  <BankAmount cents={b.currentCents} currency={currency} />
                </strong>
              </div>
            ))}
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Changes</h2>
            {data.audit.map((a) => (
              <p key={a.id} className="border-b border-white/10 py-2 text-sm">
                {a.action.replaceAll('_', ' ')}
                <span className="mt-1 block text-xs text-slate-400">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </p>
            ))}
          </section>
        </div>
      )}
    </Modal>
  )
}
