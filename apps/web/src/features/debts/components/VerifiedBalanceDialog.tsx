import { useState, type FormEvent } from 'react'
import { Button, Input } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'
import { parseMoney } from '../lib/money'

const today = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }

export function VerifiedBalanceDialog({ onClose, onSave }: { onClose: () => void; onSave: (input: {
  balanceCents: number; effectiveDate: string; source: 'creditor_statement' | 'reconciliation'; notes: string | null
}) => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [source, setSource] = useState<'creditor_statement' | 'reconciliation'>('creditor_statement')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    try {
      const balanceCents = parseMoney(amount, true)!
      setBusy(true); setError('')
      await onSave({ balanceCents, effectiveDate: date, source, notes: notes.trim() || null })
      onClose()
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  return <Modal title="Record verified balance" onClose={onClose}><form onSubmit={event => void submit(event)} className="space-y-4">
    <p className="text-sm leading-6 text-slate-400">Enter the balance shown by the creditor. Previous statements and payments remain in history.</p>
    <label className="block"><span className="mb-1 block text-xs text-slate-400">Balance *</span><Input inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label>
    <label className="block"><span className="mb-1 block text-xs text-slate-400">Statement date *</span><Input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
    <label className="block"><span className="mb-1 block text-xs text-slate-400">Source</span><select className="h-10 w-full rounded-lg border border-white/10 bg-[#151716] px-3 text-sm" value={source} onChange={event => setSource(event.target.value as typeof source)}><option value="creditor_statement">Creditor statement</option><option value="reconciliation">Reconciliation</option></select></label>
    <label className="block"><span className="mb-1 block text-xs text-slate-400">Notes</span><textarea className="h-24 w-full rounded-lg border border-white/10 bg-[#151716] px-3 py-2 text-sm" maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)} /></label>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save balance'}</Button></div>
  </form></Modal>
}
