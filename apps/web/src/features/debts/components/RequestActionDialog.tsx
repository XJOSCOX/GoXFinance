import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'

export function RequestActionDialog({ title, onClose, onSubmit }: { title: string; onClose: () => void;
  onSubmit: (reason: string, key: string) => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [key] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try { await onSubmit(reason.trim(), key); onClose() }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  return <Modal title={title} onClose={onClose}><form onSubmit={event => void submit(event)}><p className="text-sm text-slate-400">The current payment stays unchanged until the Owner approves.</p><label className="mt-4 block text-xs text-slate-400">Reason *<textarea required maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} className="mt-2 h-24 w-full rounded-lg border border-white/10 bg-[#151716] p-3 text-sm" /></label>{error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}<div className="mt-5 flex justify-end gap-2"><Button type="button" onClick={onClose}>Close</Button><Button variant="primary" disabled={busy}>{busy ? 'Submitting…' : 'Request approval'}</Button></div></form></Modal>
}
