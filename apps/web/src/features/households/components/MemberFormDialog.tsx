import { useState, type FormEvent } from 'react'
import { createMemberSchema, type HouseholdMember, type MemberStatus, type Relationship } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'
import type { MemberInput } from '../api/householdClient'

const relationships: Relationship[] = ['self', 'spouse', 'child', 'parent', 'other']
const fieldStyle = 'h-10 w-full rounded-lg border border-white/[.12] bg-[#151716] px-3 text-sm text-[#edecea] outline-none focus:border-[#a9b8a9]'

export function MemberFormDialog({ member, canChangeStatus, onSave, onClose }: {
  member: HouseholdMember | null
  canChangeStatus: boolean
  onSave: (input: MemberInput) => Promise<void>
  onClose: () => void
}) {
  const [fullName, setFullName] = useState(member?.fullName ?? '')
  const [relationship, setRelationship] = useState<Relationship>(member?.relationship ?? 'other')
  const [status, setStatus] = useState<MemberStatus>(member?.status ?? 'active')
  const [notes, setNotes] = useState(member?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = createMemberSchema.safeParse({ fullName, relationship, status, notes: notes.trim() || null })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the member details'); return }
    setBusy(true)
    setError('')
    try { await onSave(parsed.data) }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }

  return <Modal title={member ? 'Edit member' : 'Add member'} onClose={onClose}>
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Full name</span>
        <Input required maxLength={120} value={fullName} onChange={event => setFullName(event.target.value)} />
      </label>
      <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Relationship</span>
        <select className={fieldStyle} value={relationship} onChange={event => setRelationship(event.target.value as Relationship)}>
          {relationships.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
        </select>
      </label>
      {canChangeStatus && <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Status</span>
        <select className={fieldStyle} value={status} onChange={event => setStatus(event.target.value as MemberStatus)}>
          <option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </label>}
      <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Notes</span>
        <textarea rows={4} maxLength={2000} className={`${fieldStyle} h-auto min-h-24 py-2`} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional" />
      </label>
      {error && <p role="alert" className="rounded-lg border border-[#b08985]/25 bg-[#b08985]/10 p-3 text-sm text-rose-300">{error}</p>}
      <div className="flex justify-end gap-3 pt-2"><Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : member ? 'Save changes' : 'Add member'}</Button></div>
    </form>
  </Modal>
}
