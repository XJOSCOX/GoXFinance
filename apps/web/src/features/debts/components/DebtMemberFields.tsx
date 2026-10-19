import type { DebtInput, HouseholdMember } from '@goxfinance/shared'

export function DebtMemberFields({ form, set, members, role, currentMemberId, editing, requestMode }: {
  form: DebtInput; set: <K extends keyof DebtInput>(key: K, value: DebtInput[K]) => void;
  members: HouseholdMember[]; role: string; currentMemberId?: string; editing: boolean; requestMode: boolean
}) {
  const eligible = members.filter(member => member.status === 'active' &&
    (requestMode || role !== 'editor' || member.id === currentMemberId) && (requestMode || role === 'owner' || member.accessRole !== 'owner'))
  const locked = editing && role !== 'owner' && !requestMode
  return <fieldset className="mt-6"><legend className="text-sm font-medium">Responsible members *</legend>
    <p className="mt-1 text-xs text-slate-500">Select the people responsible for this account.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">{eligible.map(member => {
      const assignment = form.memberAssignments?.find(item => item.memberId === member.id)
      return <div key={member.id} className={'rounded-lg border p-3 transition-colors ' + (assignment ? 'border-[#a9b8a9]/30 bg-[#a9b8a9]/[.05]' : 'border-white/[.09] bg-[#151716]')}>
        <label className="flex cursor-pointer items-center gap-3 text-sm"><span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[.06] text-[10px] text-slate-400">{member.fullName.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><span className="min-w-0 flex-1 break-words">{member.fullName}</span>
          <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#b1beb0]" checked={Boolean(assignment)} disabled={locked} onChange={event => set('memberAssignments', event.target.checked ? [...(form.memberAssignments ?? []), { memberId: member.id, responsibility: 'primary' }] : (form.memberAssignments ?? []).filter(item => item.memberId !== member.id))}/>
        </label>
        {assignment && <select aria-label={`${member.fullName} responsibility`} className="mt-3 h-9 w-full rounded-md border border-white/10 bg-[#151716] px-2 text-xs text-slate-300 outline-none focus:border-[#a9b8a9]" value={assignment.responsibility} disabled={locked} onChange={event => set('memberAssignments', (form.memberAssignments ?? []).map(item => item.memberId === member.id ? { ...item, responsibility: event.target.value as typeof item.responsibility } : item))}>
          <option value="primary">Primary</option><option value="joint">Joint</option><option value="authorized_user">Authorized user</option><option value="other">Other</option>
        </select>}
      </div>
    })}</div>
    {!eligible.length && <p className="mt-3 text-xs text-slate-400">No eligible members. Add an active household member first.</p>}
  </fieldset>
}
