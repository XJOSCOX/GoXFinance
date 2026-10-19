import type { HouseholdMember } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'

export function MemberList({ members, canEdit, canRemove, view, edit, deactivate, reactivate }: {
  members: HouseholdMember[]
  canEdit: boolean
  canRemove: boolean
  view: (member: HouseholdMember) => void
  edit: (member: HouseholdMember) => void
  deactivate: (member: HouseholdMember) => void
  reactivate: (member: HouseholdMember) => void
}) {
  if (!members.length) return <Card className="p-8 text-center text-sm text-slate-400">No household members yet.</Card>

  return <div className="grid gap-3 lg:grid-cols-2">
    {members.map(member => <Card key={member.id} className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h3 className="truncate text-base font-medium">{member.fullName}</h3>
          <p className="mt-1 text-sm capitalize text-slate-400">{member.relationship}</p></div>
        <span className={`rounded-md border px-2 py-1 text-xs ${member.status === 'active'
          ? 'border-[#9cac9b]/25 bg-[#9cac9b]/10 text-[#b9c9b8]'
          : 'border-white/10 bg-white/5 text-slate-400'}`}>{member.status === 'active' ? 'Active' : 'Inactive'}</span>
      </div>
      {member.accessRole && <p className="mt-3 text-xs capitalize text-slate-500">{member.accessRole} access</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="small" onClick={() => view(member)}>Details</Button>
        {canEdit && <Button size="small" onClick={() => edit(member)}>Edit</Button>}
        {canRemove && member.accessRole !== 'owner' && (member.status === 'active'
          ? <Button size="small" onClick={() => deactivate(member)}>Deactivate</Button>
          : <Button size="small" onClick={() => reactivate(member)}>Reactivate</Button>)}
      </div>
    </Card>)}
  </div>
}
