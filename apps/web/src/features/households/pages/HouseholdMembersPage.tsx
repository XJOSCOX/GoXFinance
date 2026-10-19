import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { canManageHousehold, type HouseholdMember } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../../components/ui'
import { errorMessage } from '../../../lib/api'
import { getMember, type MemberInput } from '../api/householdClient'
import { ConfirmDeactivateDialog } from '../components/ConfirmDeactivateDialog'
import { HouseholdSettings } from '../components/HouseholdSettings'
import { MemberDetailsDialog } from '../components/MemberDetailsDialog'
import { MemberFormDialog } from '../components/MemberFormDialog'
import { MemberList } from '../components/MemberList'
import { useHousehold } from '../hooks/useHousehold'
import { useMembers } from '../hooks/useMembers'

export function HouseholdMembersPage() {
  const { householdId = '' } = useParams()
  const { selected } = useHousehold()
  const { members, loading, error, refresh, save, deactivate } = useMembers(householdId)
  const [formMember, setFormMember] = useState<HouseholdMember | null | undefined>(undefined)
  const [detail, setDetail] = useState<HouseholdMember | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<HouseholdMember | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  if (!selected || selected.id !== householdId) return <WorkspaceLayout title="Household"><Card className="p-6">Household not found.</Card></WorkspaceLayout>
  const canAdd = canManageHousehold(selected.role, 'addMember')
  const canEdit = canManageHousehold(selected.role, 'editMember')
  const canRemove = canManageHousehold(selected.role, 'removeMember')
  const canSettings = canManageHousehold(selected.role, 'manageSettings')

  async function openDetails(member: HouseholdMember) {
    try { setActionError(''); setDetail((await getMember(householdId, member.id)).member) }
    catch (failure) { setActionError(errorMessage(failure)) }
  }
  async function saveForm(input: MemberInput) {
    await save(formMember?.id ?? null, input)
    setNotice(formMember ? 'Member updated.' : 'Member added.')
    setFormMember(undefined)
  }
  async function confirmDeactivate() {
    if (!deactivateTarget) return
    setBusy(true)
    try { await deactivate(deactivateTarget.id); setNotice('Member deactivated.'); setDeactivateTarget(null) }
    catch (failure) { setActionError(errorMessage(failure)); setDeactivateTarget(null) }
    finally { setBusy(false) }
  }
  async function reactivate(member: HouseholdMember) {
    try { await save(member.id, { fullName: member.fullName, relationship: member.relationship, status: 'active', notes: member.notes }); setNotice('Member reactivated.') }
    catch (failure) { setActionError(errorMessage(failure)) }
  }

  return <WorkspaceLayout title="Household">
    <div className="section-heading mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">Household</p>
        <h1 className="text-3xl font-semibold tracking-tight">{selected.name}</h1>
        <p className="mt-2 text-sm text-slate-400">Manage the people in your household.</p></div>
      {canAdd && <Button variant="primary" onClick={() => setFormMember(null)}>Add member</Button>}
    </div>
    {notice && <p role="status" className="mb-4 rounded-lg border border-[#9cac9b]/20 bg-[#9cac9b]/10 p-3 text-sm text-[#b9c9b8]">{notice}</p>}
    {actionError && <p role="alert" className="mb-4 text-sm text-rose-300">{actionError}</p>}
    {loading ? <p role="status" className="text-sm text-slate-400">Loading members…</p> : error
      ? <Card className="p-6"><p role="alert" className="text-sm text-rose-300">{error}</p><Button className="mt-4" onClick={() => void refresh()}>Try again</Button></Card>
      : <MemberList members={members} canEdit={canEdit} canRemove={canRemove}
          view={member => void openDetails(member)} edit={setFormMember} deactivate={setDeactivateTarget}
          reactivate={member => void reactivate(member)} />}
    {canSettings && <HouseholdSettings key={selected.id} household={selected} />}
    {formMember !== undefined && <MemberFormDialog member={formMember} canChangeStatus={canRemove}
      onClose={() => setFormMember(undefined)} onSave={saveForm} />}
    {detail && <MemberDetailsDialog member={detail} onClose={() => setDetail(null)}
      onEdit={canEdit ? () => { setFormMember(detail); setDetail(null) } : undefined} />}
    {deactivateTarget && <ConfirmDeactivateDialog name={deactivateTarget.fullName} busy={busy}
      onClose={() => setDeactivateTarget(null)} onConfirm={() => void confirmDeactivate()} />}
  </WorkspaceLayout>
}
