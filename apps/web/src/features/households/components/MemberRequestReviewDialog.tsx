import { useRef, useState } from 'react'
import type { HouseholdMemberRequest, InvitationRole } from '@goxfinance/shared'
import { Button } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { approveMemberRequest, rejectMemberRequest } from '../api/householdClient'

export function MemberRequestReviewDialog({ householdId, request, initialAction, onClose, onChanged }: {
  householdId: string
  request: HouseholdMemberRequest
  initialAction: 'approve' | 'reject' | null
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const notify = useNotify()
  const [role, setRole] = useState<InvitationRole>('viewer')
  const [action, setAction] = useState(initialAction)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)

  async function apply() {
    if (!action || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      if (action === 'approve') await approveMemberRequest(householdId, request.id, role)
      else await rejectMemberRequest(householdId, request.id)
      await onChanged()
      notify('success', action === 'approve' ? 'Member approved. You can now generate an invitation.' : 'Member request rejected')
      onClose()
    } catch (failure) { const message = errorMessage(failure); setError(message); notify('error', message) }
    finally { busyRef.current = false; setBusy(false) }
  }

  return <Modal title={`Review ${request.fullName}`} onClose={onClose}>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-slate-400">Relationship</dt><dd className="capitalize">{request.relationship}</dd>
      <dt className="text-slate-400">Proposed by</dt><dd>{request.proposedByName}</dd>
      <dt className="text-slate-400">Requested</dt><dd>{new Date(request.createdAt).toLocaleDateString()}</dd>
      <dt className="text-slate-400">Status</dt><dd className="capitalize">{request.status}</dd>
      <dt className="text-slate-400">Notes</dt><dd className="whitespace-pre-wrap break-words">{request.notes || 'None'}</dd>
    </dl>
    {request.status === 'pending' && <>
      {action === 'approve' && <label className="mt-5 block text-sm">Planned access role
        <select className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#151716] px-3" value={role}
          onChange={event => setRole(event.target.value as InvitationRole)}>
          <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option>
        </select>
        <span className="mt-2 block text-xs text-slate-400">The approved member gets access only after accepting an invitation.</span>
      </label>}
      {action === 'reject' && <p className="mt-5 rounded-lg border border-amber-400/25 p-3 text-sm">Reject this request? No member or invitation will be created.</p>}
      {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button type="button" onClick={onClose}>Close</Button>
        <Button type="button" onClick={() => setAction('reject')}>Reject</Button>
        <Button type="button" onClick={() => setAction('approve')}>Approve</Button>
        {action && <Button type="button" variant="primary" disabled={busy} onClick={() => void apply()}>
          {busy ? 'Saving…' : action === 'approve' ? 'Confirm approval' : 'Confirm rejection'}</Button>}
      </div>
    </>}
    {request.status !== 'pending' && <div className="mt-6 flex justify-end"><Button onClick={onClose}>Close</Button></div>}
  </Modal>
}
