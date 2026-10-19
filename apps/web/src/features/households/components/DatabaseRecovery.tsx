import { useState } from 'react'
import { Button, Input } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { apiRequest, errorMessage } from '../../../lib/api'
import { useNotify } from '../../../components/ui/useNotify'

type Backup = { id: string; createdAt: string }
export function DatabaseRecovery() {
  const notify = useNotify()
  const [open, setOpen] = useState(false)
  const [backups, setBackups] = useState<Backup[]>([])
  const [target, setTarget] = useState<Backup | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState(false)
  async function load() {
    setOpen(true); setBusy(true); setError('')
    try { setBackups((await apiRequest<{ backups: Backup[] }>('backups')).backups) }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  async function create() {
    if (busy) return
    setBusy(true); setError('')
    try {
      await apiRequest('backups', { method: 'POST', body: '{}' })
      setBackups((await apiRequest<{ backups: Backup[] }>('backups')).backups)
      notify('success', 'Verified database backup created')
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  async function restore() {
    if (!target || busy || confirmation !== 'RESTORE DATABASE') return
    setBusy(true); setError('')
    try {
      await apiRequest(`backups/${target.id}/restore`, { method: 'POST', body: JSON.stringify({ confirmation }) })
      setQueued(true); notify('success', 'Restore queued. Restart the API to apply it.')
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  return <div className="mt-5 flex justify-end"><Button size="small" variant="ghost" onClick={() => void load()}>Database recovery</Button>{open && <Modal title="Database recovery" onClose={() => setOpen(false)}><p className="text-sm leading-6 text-slate-400">Backups include the entire local database. Access is limited to the Owner of every household. Snapshots stay on this computer.</p>{error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    {queued ? <p role="status" className="mt-4 text-sm">Restore queued. Stop and restart the API. Writes are paused until restart; sign in again afterward.</p> : target ? <div className="mt-4"><p className="text-sm">Restore the snapshot from {new Date(target.createdAt).toLocaleString()}? This replaces all users, households, and financial records. A recovery snapshot is created first.</p><label className="mt-4 block text-xs text-slate-400">Type RESTORE DATABASE to confirm<Input className="mt-2" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><div className="mt-4 flex justify-end gap-2"><Button onClick={() => setTarget(null)}>Back</Button><Button variant="primary" disabled={busy || confirmation !== 'RESTORE DATABASE'} onClick={() => void restore()}>Queue restore</Button></div></div>
      : <><div className="mt-4 flex justify-end"><Button disabled={busy} variant="primary" onClick={() => void create()}>{busy ? 'Working…' : 'Create backup'}</Button></div><div className="mt-4 space-y-2">{backups.map(backup => <div key={backup.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-sm"><span>{new Date(backup.createdAt).toLocaleString()}</span><Button size="small" onClick={() => { setTarget(backup); setConfirmation('') }}>Restore</Button></div>)}</div></>}
  </Modal>}</div>
}
