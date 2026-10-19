import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { canManageHousehold, type HouseholdMember } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../../components/ui'
import { errorMessage } from '../../../lib/api'
import { getMember, type MemberInput } from '../api/householdClient'
import { ConfirmDeactivateDialog } from '../components/ConfirmDeactivateDialog'
import { HouseholdOverview } from '../components/HouseholdOverview'
import { HouseholdDetailsDialog } from '../components/HouseholdDetailsDialog'
import { HouseholdEditDialog } from '../components/HouseholdEditDialog'
import { MemberDetailsDialog } from '../components/MemberDetailsDialog'
import { MemberFormDialog } from '../components/MemberFormDialog'
import { MemberList } from '../components/MemberList'
import { InvitationDialog } from '../components/InvitationDialog'
import { useNotify } from '../../../components/ui/useNotify'
import { useHousehold } from '../hooks/useHousehold'
import { useMembers } from '../hooks/useMembers'

export function HouseholdMembersPage() {
  const { householdId = '' } = useParams()
  const navigate = useNavigate()
  const { selected, households, select, refresh: refreshHouseholds } = useHousehold()
  const notify = useNotify()
  const { members, loading, error, refresh, save, deactivate } = useMembers(householdId)
  const [formMember, setFormMember] = useState<HouseholdMember | null | undefined>(undefined)
  const [detail, setDetail] = useState<HouseholdMember | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<HouseholdMember | null>(null)
  const [inviteTarget, setInviteTarget] = useState<HouseholdMember | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => { if (households.some(household => household.id === householdId) && selected?.id !== householdId) select(householdId) }, [householdId, households, selected?.id, select])
  const household = households.find(item => item.id === householdId)
  if (!household) return <WorkspaceLayout title="Household"><Card className="p-6">Household not found.</Card></WorkspaceLayout>
  const canAdd = canManageHousehold(household.role, 'addMember')
  const canEdit = canManageHousehold(household.role, 'editMember')
  const canRemove = canManageHousehold(household.role, 'removeMember')
  const canSettings = canManageHousehold(household.role, 'manageSettings')
  const canInvite = canManageHousehold(household.role, 'manageRoles')

  async function openDetails(member: HouseholdMember) {
    try { setActionError(''); setDetail((await getMember(householdId, member.id)).member) }
    catch (failure) { setActionError(errorMessage(failure)) }
  }
  async function saveForm(input: MemberInput) {
    await save(formMember?.id ?? null, input)
    const message = formMember ? 'Member updated successfully' : 'Member added successfully'
    setNotice(message); notify('success', message)
    setFormMember(undefined)
  }
  async function confirmDeactivate() {
    if (!deactivateTarget) return
    setBusy(true)
    try {
      const linked = Boolean(deactivateTarget.linkedUserId)
      await deactivate(deactivateTarget.id)
      await refreshHouseholds()
      const message = linked ? 'Removed from household' : 'Member deactivated'
      setNotice(message); notify('success', message); setDeactivateTarget(null)
    }
    catch (failure) { const message = errorMessage(failure); setActionError(message); notify('error', message) }
    finally { setBusy(false) }
  }
  async function reactivate(member: HouseholdMember) {
    try { await save(member.id, { fullName: member.fullName, relationship: member.relationship, status: 'active', notes: member.notes }); setNotice('Member reactivated.'); notify('success', 'Member reactivated') }
    catch (failure) { const message = errorMessage(failure); setActionError(message); notify('error', message) }
  }

  return <WorkspaceLayout title="Household">
    <HouseholdOverview household={household} canEdit={canSettings} canAdd={canAdd}
      onDetails={() => setShowDetails(true)} onEdit={() => setShowEdit(true)}
      onJoin={() => navigate('/household/join')} onAdd={() => setFormMember(null)}>
      {notice && <p role="status" className="my-4 rounded-lg border border-[#9cac9b]/20 bg-[#9cac9b]/10 p-3 text-sm text-[#b9c9b8]">{notice}</p>}
      {actionError && <p role="alert" className="my-4 text-sm text-rose-300">{actionError}</p>}
      {loading ? <p role="status" className="py-6 text-sm text-slate-400">Loading members…</p> : error
      ? <div className="py-6"><p role="alert" className="text-sm text-rose-300">{error}</p><Button className="mt-4" onClick={() => void refresh()}>Try again</Button></div>
      : <MemberList members={members} canEdit={canEdit} canRemove={canRemove} canInvite={canInvite}
          view={member => void openDetails(member)} edit={setFormMember} deactivate={setDeactivateTarget}
          reactivate={member => void reactivate(member)} invite={setInviteTarget} />}
    </HouseholdOverview>
    {showDetails && <HouseholdDetailsDialog household={household} memberCount={loading || error ? null : members.length}
      onClose={() => setShowDetails(false)} onEdit={canSettings ? () => { setShowDetails(false); setShowEdit(true) } : undefined} />}
    {showEdit && <HouseholdEditDialog key={household.id} household={household} onClose={() => setShowEdit(false)} />}
    {formMember !== undefined && <MemberFormDialog member={formMember}
      onClose={() => setFormMember(undefined)} onSave={saveForm} />}
    {detail && <MemberDetailsDialog member={detail} onClose={() => setDetail(null)}
      onEdit={canEdit ? () => { setFormMember(detail); setDetail(null) } : undefined} />}
    {deactivateTarget && <ConfirmDeactivateDialog name={deactivateTarget.fullName} linked={Boolean(deactivateTarget.linkedUserId)} busy={busy}
      onClose={() => setDeactivateTarget(null)} onConfirm={() => void confirmDeactivate()} />}
    {inviteTarget && <InvitationDialog key={inviteTarget.id} householdId={householdId} member={inviteTarget}
      onClose={() => setInviteTarget(null)} onChanged={refresh} />}
  </WorkspaceLayout>
}
