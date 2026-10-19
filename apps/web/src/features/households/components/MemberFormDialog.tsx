import { useRef, useState, type FormEvent } from 'react'
import { createMemberSchema, type HouseholdMember, type InvitationRole, type Relationship } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'
import { useNotify } from '../../../components/ui/useNotify'
import type { MemberInput } from '../api/householdClient'

const relationships: Relationship[] = ['self', 'spouse', 'child', 'parent', 'other']
const fieldStyle = 'h-10 w-full rounded-lg border border-white/[.12] bg-[#151716] px-3 text-sm text-[#edecea] outline-none focus:border-[#a9b8a9]'

export function MemberFormDialog({ member, mode = 'member', onSave, onClose }: {
  member: HouseholdMember | null
  mode?: 'member' | 'proposal'
  onSave: (input: MemberInput) => Promise<void>
  onClose: () => void
}) {
  const notify = useNotify()
  const [fullName, setFullName] = useState(member?.fullName ?? '')
  const [relationship, setRelationship] = useState<Relationship>(member?.relationship ?? 'other')
  const [notes, setNotes] = useState(member?.notes ?? '')
  const [plannedAccessRole, setPlannedAccessRole] = useState<InvitationRole>(member?.plannedAccessRole ?? 'viewer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const busyRef = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busyRef.current) return
    const parsed = createMemberSchema.safeParse({ fullName, relationship, notes: notes.trim() || null, plannedAccessRole })
    if (!parsed.success) {
      const fields: Record<string, string> = {}
      for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message
      setFieldErrors(fields)
      return
    }
    setFieldErrors({})
    busyRef.current = true
    setBusy(true)
    setError('')
    try { await onSave(member || mode === 'proposal'
      ? { fullName: parsed.data.fullName, relationship: parsed.data.relationship, notes: parsed.data.notes }
      : parsed.data) }
    catch (failure) { const message = errorMessage(failure); setError(message); notify('error', message) }
    finally { busyRef.current = false; setBusy(false) }
  }

  return <Modal title={member ? 'Edit member' : mode === 'proposal' ? 'Propose member' : 'Add member'} onClose={onClose}>
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Full name</span>
        <Input required maxLength={120} value={fullName} onChange={event => setFullName(event.target.value)} />
        {fieldErrors.fullName && <span className="mt-1 block text-rose-300">{fieldErrors.fullName}</span>}
      </label>
      {!member && mode === 'member' && <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Planned access</span>
        <select className={fieldStyle} value={plannedAccessRole} onChange={event => setPlannedAccessRole(event.target.value as InvitationRole)}>
          <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option>
        </select>
        <span className="mt-1 block text-xs text-slate-500">Access begins only after invitation acceptance.</span>
      </label>}
      <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Relationship</span>
        <select className={fieldStyle} value={relationship} onChange={event => setRelationship(event.target.value as Relationship)}>
          {relationships.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
        </select>
        {fieldErrors.relationship && <span className="mt-1 block text-rose-300">{fieldErrors.relationship}</span>}
      </label>
      <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Notes</span>
        <textarea rows={4} maxLength={2000} className={`${fieldStyle} h-auto min-h-24 py-2`} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional" />
        {fieldErrors.notes && <span className="mt-1 block text-rose-300">{fieldErrors.notes}</span>}
      </label>
      {error && <p role="alert" className="rounded-lg border border-[#b08985]/25 bg-[#b08985]/10 p-3 text-sm text-rose-300">{error}</p>}
      <div className="flex justify-end gap-3 pt-2"><Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : member ? 'Save changes' : mode === 'proposal' ? 'Submit proposal' : 'Add member'}</Button></div>
    </form>
  </Modal>
}
