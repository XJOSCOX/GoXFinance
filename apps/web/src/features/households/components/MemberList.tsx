import type { HouseholdMember } from '@goxfinance/shared'
import { Button } from '../../../components/ui'

export function MemberList({ members, canEdit, canRemove, canInvite, view, edit, deactivate, reactivate, invite }: {
  members: HouseholdMember[]
  canEdit: boolean
  canRemove: boolean
  canInvite: boolean
  view: (member: HouseholdMember) => void
  edit: (member: HouseholdMember) => void
  deactivate: (member: HouseholdMember) => void
  reactivate: (member: HouseholdMember) => void
  invite: (member: HouseholdMember) => void
}) {
  if (!members.length) return <p className="py-8 text-center text-sm text-slate-400">No members yet.</p>

  return <div className="mt-4 grid gap-3 lg:grid-cols-2">
    {members.map(member => <div key={member.id} className="flex min-w-0 flex-col rounded-xl border border-white/10 bg-white/[.025] p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-base font-medium">{member.fullName}</h3>
          <p className="mt-1 text-sm capitalize text-slate-400">{member.relationship}</p>
          <p className="mt-2 text-xs text-slate-400">{member.linkedUserId ? 'Linked' : member.invitation ? 'Invitation pending' : 'Not registered'}</p>
          {canInvite && member.accessRole && <p className="mt-1 text-xs capitalize text-slate-500">{member.accessRole} access</p>}
          {member.invitation && <p className="mt-1 text-xs text-slate-500">Invitation expires {new Date(member.invitation.expiresAt).toLocaleDateString()}</p>}
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-xs ${member.status === 'active'
          ? 'border-[#9cac9b]/25 bg-[#9cac9b]/10 text-[#b9c9b8]'
          : 'border-white/10 bg-white/5 text-slate-400'}`}>{member.status === 'active' ? 'Active' : 'Inactive'}</span>
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <Button size="small" onClick={() => view(member)}>View</Button>
        {canEdit && <Button size="small" onClick={() => edit(member)}>Edit</Button>}
        {canInvite && !member.linkedUserId && member.status === 'active' && <Button size="small" onClick={() => invite(member)}>{member.invitation ? 'Manage invitation' : 'Generate invitation'}</Button>}
        {canRemove && member.accessRole !== 'owner' && (member.status === 'active'
          ? <Button size="small" onClick={() => deactivate(member)}>{member.linkedUserId ? 'Remove from household' : 'Deactivate'}</Button>
          : <Button size="small" onClick={() => reactivate(member)}>Reactivate</Button>)}
      </div>
    </div>)}
  </div>
}
