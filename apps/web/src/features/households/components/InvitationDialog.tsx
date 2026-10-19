import { useRef, useState } from 'react'
import type { HouseholdMember, InvitationSummary } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { generateInvitation, regenerateInvitation, revokeInvitation } from '../api/householdClient'

export function InvitationDialog({ householdId, member, onClose, onChanged }: {
  householdId: string
  member: HouseholdMember
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const notify = useNotify()
  const [invitation, setInvitation] = useState<InvitationSummary | null>(member.invitation ?? null)
  const [code, setCode] = useState('')
  const [confirmAction, setConfirmAction] = useState<'revoke' | 'regenerate' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)

  async function run(action: 'generate' | 'revoke' | 'regenerate') {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      if (action === 'generate') {
        const result = await generateInvitation(householdId, member.id)
        setInvitation(result.invitation); setCode(result.code)
        notify('success', 'Invitation generated successfully')
      } else if (action === 'regenerate' && invitation) {
        const result = await regenerateInvitation(householdId, member.id, invitation.id)
        setInvitation(result.invitation); setCode(result.code)
        notify('success', 'Invitation code regenerated')
      } else if (action === 'revoke' && invitation) {
        await revokeInvitation(householdId, member.id, invitation.id)
        setInvitation(null); setCode('')
        notify('success', 'Invitation revoked')
      }
      await onChanged()
      setConfirmAction(null)
    } catch (failure) { const message = errorMessage(failure); setError(message); notify('error', message) }
    finally { busyRef.current = false; setBusy(false) }
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(code); notify('info', 'Invitation code copied') }
    catch { notify('error', 'Unable to copy. Select and copy the code manually.') }
  }

  return <Modal title={`Invite ${member.fullName}`} onClose={onClose}>
    <p className="text-sm leading-6 text-slate-400">An invitation links an account to this member record. Codes expire after seven days and work once.</p>
    {invitation ? <div className="mt-5 space-y-3 rounded-lg border border-white/10 bg-white/[.03] p-4 text-sm">
      <p>Invitation pending · {invitation.role ?? 'Assigned'} access</p>
      <p className="text-slate-400">Expires {new Date(invitation.expiresAt).toLocaleString()}</p>
      {code ? <><label className="block"><span className="mb-1.5 block text-slate-300">Invitation code · shown only now</span>
        <Input readOnly value={code} onFocus={event => event.currentTarget.select()} /></label>
        <Button type="button" onClick={() => void copyCode()}>Copy code</Button></>
        : <p className="text-slate-400">The previous code cannot be displayed again. Regenerate to get a new one.</p>}
    </div> : <p className="mt-5 text-sm text-slate-300">Planned access: <span className="capitalize">{member.plannedAccessRole}</span></p>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
    {confirmAction && <div className="mt-5 rounded-lg border border-amber-400/25 bg-amber-400/5 p-4 text-sm">
      <p>{confirmAction === 'revoke' ? 'Revoke this invitation? The current code will stop working.' : 'Regenerate this invitation? The current code will stop working.'}</p>
      <div className="mt-3 flex gap-2"><Button type="button" size="small" onClick={() => setConfirmAction(null)}>Cancel</Button>
        <Button type="button" size="small" variant="primary" disabled={busy} onClick={() => void run(confirmAction)}>Confirm {confirmAction}</Button></div>
    </div>}
    <div className="mt-6 flex flex-wrap justify-end gap-2">
      <Button type="button" onClick={onClose}>Close</Button>
      {invitation ? <><Button type="button" disabled={busy} onClick={() => setConfirmAction('revoke')}>Revoke invitation</Button>
        <Button type="button" variant="primary" disabled={busy} onClick={() => setConfirmAction('regenerate')}>Regenerate code</Button></>
        : <Button type="button" variant="primary" disabled={busy} onClick={() => void run('generate')}>{busy ? 'Generating…' : 'Generate invitation'}</Button>}
    </div>
  </Modal>
}
