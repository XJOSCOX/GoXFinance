import { useRef, useState } from 'react'
import type { HouseholdMember, InvitationRole } from '@goxfinance/shared'
import { Button } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { updateMemberRole } from '../api/householdClient'

const roles: { value: InvitationRole; description: string }[] = [
  { value: 'viewer', description: 'Can view household information.' },
  { value: 'editor', description: 'Can edit regular member details and propose members.' },
  { value: 'admin', description: 'Can edit regular member and household details, and propose members.' },
]

export function ManageAccessDialog({ householdId, member, onClose, onChanged }: {
  householdId: string
  member: HouseholdMember
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const notify = useNotify()
  const current = member.linkedUserId ? member.accessRole : member.plannedAccessRole
  const [role, setRole] = useState<InvitationRole>(current === 'admin' || current === 'editor' ? current : 'viewer')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)
  const planned = !member.linkedUserId

  async function save() {
    if (busyRef.current || role === current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await updateMemberRole(householdId, member.id, role)
      await onChanged()
      notify('success', planned ? member.invitation
        ? 'Planned access role saved. Previous invitation revoked. Generate a new invitation.'
        : 'Planned access role saved' : 'Member role updated successfully')
      onClose()
    } catch (failure) { const message = errorMessage(failure); setError(message); notify('error', message) }
    finally { busyRef.current = false; setBusy(false) }
  }

  return <Modal title={`Manage access · ${member.fullName}`} onClose={onClose}>
    <p className="text-sm text-slate-400">{planned ? 'Planned role. Access begins only after this person accepts an invitation.' : 'Active role. Changes take effect on the next request.'}</p>
    <p className="mt-3 text-sm">Current {planned ? 'planned' : 'active'} role: <span className="font-semibold capitalize">{current}</span></p>
    <fieldset className="mt-5 space-y-2"><legend className="mb-2 text-sm font-medium">Choose access</legend>
      {roles.map(option => <label key={option.value} className="flex cursor-pointer gap-3 rounded-lg border border-white/10 p-3 text-sm">
        <input type="radio" name="access-role" value={option.value} checked={role === option.value}
          onChange={() => { setRole(option.value); setConfirm(false) }} />
        <span><span className="block font-medium capitalize">{option.value}</span><span className="text-slate-400">{option.description}</span></span>
      </label>)}
    </fieldset>
    <p className="mt-4 text-xs text-slate-500">Owner access is permanent and cannot be assigned or transferred here.</p>
    {planned && member.invitation && role !== current && <p className="mt-3 text-sm text-amber-200">Changing this role revokes the pending invitation. Generate a new code afterward.</p>}
    {confirm && <p className="mt-4 rounded-lg border border-white/10 p-3 text-sm">Confirm changing {member.fullName} from <span className="capitalize">{current}</span> to <span className="capitalize">{role}</span>?</p>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
    <div className="mt-6 flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button>
      <Button type="button" variant="primary" disabled={busy || role === current}
        onClick={() => confirm ? void save() : setConfirm(true)}>{busy ? 'Saving…' : confirm ? 'Confirm change' : 'Save access'}</Button></div>
  </Modal>
}
