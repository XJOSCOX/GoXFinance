import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { calculateDebtSummary, debtTypeLabels, paymentStatusLabels, type Debt, type DebtInput, type HouseholdMember } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card, Input } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { listMembers } from '../../households/api/householdClient'
import { useHousehold } from '../../households/hooks/useHousehold'
import { useAuth } from '../../auth/hooks/useAuth'
import { archiveDebt, createDebt, listDebts, restoreDebt, updateDebt } from '../api/debtClient'
import { DebtFormDialog } from '../components/DebtFormDialog'
import { DebtSummary } from '../components/DebtSummary'

const money = (cents: number | null) => cents == null ? 'Unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export function DebtsPage() {
  const { householdId = '' } = useParams()
  const { households, selected, select } = useHousehold()
  const household = households.find(item => item.id === householdId)
  const notify = useNotify()
  const { user } = useAuth()
  const [debts, setDebts] = useState<Debt[]>([])
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formDebt, setFormDebt] = useState<Debt | null | undefined>(undefined)
  const [detail, setDetail] = useState<Debt | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<Debt | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [memberFilter, setMemberFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState('updated')
  const [showArchived, setShowArchived] = useState(false)
  useEffect(() => { if (household && selected?.id !== householdId) select(householdId) }, [household, householdId, selected?.id, select])
  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([listDebts(householdId), listMembers(householdId)])
      .then(([results, people]) => { if (active) { setDebts(results.debts); setMembers(people.members); setError('') } })
      .catch(failure => { if (active) setError(errorMessage(failure)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [householdId])
  const summary = useMemo(() => calculateDebtSummary(debts), [debts])
  const visible = useMemo(() => debts.filter(debt => debt.isArchived === showArchived &&
    `${debt.creditorName} ${debt.accountNickname ?? ''} ${debt.collectionAgency ?? ''}`.toLowerCase().includes(query.toLowerCase()) &&
    (!memberFilter || debt.memberAssignments.some(item => item.memberId === memberFilter)) &&
    (!typeFilter || debt.accountType === typeFilter) && (!statusFilter || debt.paymentStatus === statusFilter))
    .sort((a, b) => sort === 'balance' ? (b.currentBalanceCents ?? -1) - (a.currentBalanceCents ?? -1)
      : sort === 'creditor' ? a.creditorName.localeCompare(b.creditorName) : b.updatedAt.localeCompare(a.updatedAt)),
  [debts, showArchived, query, memberFilter, typeFilter, statusFilter, sort])
  if (!household) return <WorkspaceLayout title="Debts"><Card className="p-6">Household not found.</Card></WorkspaceLayout>
  const currentMember = members.find(member => member.linkedUserId === user?.id && member.status === 'active')
  const canWrite = household.role !== 'viewer'
  function canManage(debt: Debt, archive = false) {
    if (household?.role === 'owner') return true
    if (household?.role === 'viewer' || !user) return false
    const ownerExclusive = debt.memberAssignments.every(item => members.find(member => member.id === item.memberId)?.accessRole === 'owner')
    if (ownerExclusive || (debt.createdByUserId !== user.id && !debt.memberAssignments.some(item => item.memberId === currentMember?.id))) return false
    return !archive || household?.role !== 'editor' || debt.memberAssignments.every(item => item.memberId === currentMember?.id)
  }
  async function save(input: DebtInput) {
    if (formDebt) await updateDebt(householdId, formDebt.id, input)
    else await createDebt(householdId, input)
    setDebts((await listDebts(householdId)).debts)
    notify('success', formDebt ? 'Debt updated' : 'Debt added')
  }
  async function changeArchive(target: Debt) {
    setBusy(true)
    try {
      if (target.isArchived) await restoreDebt(householdId, target.id)
      else await archiveDebt(householdId, target.id)
      setDebts((await listDebts(householdId)).debts)
      notify('success', target.isArchived ? 'Debt restored' : 'Debt archived')
      setArchiveTarget(null)
    } catch (failure) { notify('error', errorMessage(failure)) }
    finally { setBusy(false) }
  }
  const selectClass = 'h-10 rounded-lg border border-white/10 bg-[#1b1d1c] px-3 text-sm text-slate-200'
  return <WorkspaceLayout title="Debts"><div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.2em] text-slate-500">Household obligations</p><h1 className="mt-2 text-2xl font-semibold">Debts</h1><p className="mt-1 text-sm text-slate-400">Track balances and responsible members. Unknown amounts stay unknown.</p></div>{canWrite && <Button variant="primary" onClick={() => setFormDebt(null)}>Add debt</Button>}</div>
    {loading ? <p role="status">Loading debts…</p> : error ? <Card className="p-5"><p role="alert" className="text-rose-300">{error}</p><Button className="mt-3" onClick={() => window.location.reload()}>Try again</Button></Card> : <>
      <DebtSummary summary={summary} members={members} />
      <Card className="p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><Input aria-label="Search debts" placeholder="Search creditor or nickname" value={query} onChange={event => setQuery(event.target.value)} className="lg:col-span-2" />
        <select aria-label="Filter by member" className={selectClass} value={memberFilter} onChange={event => setMemberFilter(event.target.value)}><option value="">All members</option>{members.map(member => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select>
        <select aria-label="Filter by type" className={selectClass} value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="">All types</option>{Object.entries(debtTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Filter by payment status" className={selectClass} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All statuses</option>{Object.entries(paymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Sort debts" className={selectClass} value={sort} onChange={event => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="balance">Highest balance</option><option value="creditor">Creditor name</option></select></div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)}/>Show archived</label></Card>
      {visible.length ? <div className="grid gap-3 lg:grid-cols-2">{visible.map(debt => <Card key={debt.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{debt.creditorName}</h2><p className="text-xs text-slate-400">{debt.accountNickname || debtTypeLabels[debt.accountType]} · {paymentStatusLabels[debt.paymentStatus]}</p></div><span className="text-xl font-semibold">{money(debt.currentBalanceCents)}</span></div><p className="mt-3 text-xs text-slate-400">{debt.memberAssignments.map(item => members.find(member => member.id === item.memberId)?.fullName ?? 'Member').join(', ')} · {debt.confidence}</p><div className="mt-4 flex flex-wrap gap-2"><Button size="small" onClick={() => setDetail(debt)}>View</Button>{!debt.isArchived && canManage(debt) && <Button size="small" onClick={() => setFormDebt(debt)}>Edit</Button>}{canManage(debt, true) && <Button size="small" onClick={() => setArchiveTarget(debt)}>{debt.isArchived ? 'Restore' : 'Archive'}</Button>}</div></Card>)}</div>
      : <Card className="p-10 text-center text-sm text-slate-400">{debts.length ? 'No debts match these filters.' : 'No debts recorded. Add an account to start tracking your household obligations.'}</Card>}
    </>}
    {formDebt !== undefined && <DebtFormDialog key={formDebt?.id ?? 'new'} debt={formDebt} members={members} debts={debts} role={household.role} currentMemberId={currentMember?.id} onClose={() => setFormDebt(undefined)} onSave={save} />}
    {detail && <Modal title={detail.creditorName} onClose={() => setDetail(null)}><dl className="grid grid-cols-2 gap-3 text-sm">{[
      ['Current balance', money(detail.currentBalanceCents)], ['Original balance', money(detail.originalBalanceCents)], ['Minimum payment', money(detail.minimumPaymentCents)], ['Past due', money(detail.pastDueAmountCents)],
      ['APR', detail.interestRateApr ? `${detail.interestRateApr}%` : 'Unknown'], ['Due date', detail.nextDueDate ?? 'Unknown'],
      ['Account status', detail.accountStatus], ['Payment status', paymentStatusLabels[detail.paymentStatus]], ['Confidence', detail.confidence],
      ['Collection agency', detail.collectionAgency ?? 'None'], ['Original creditor', detail.originalCreditor ?? 'Unknown'],
    ].map(([name, value]) => <div key={name}><dt className="text-slate-500">{name}</dt><dd>{value}</dd></div>)}</dl><p className="mt-4 whitespace-pre-wrap text-sm text-slate-300">{detail.notes}</p></Modal>}
    {archiveTarget && <Modal title={archiveTarget.isArchived ? 'Restore debt?' : 'Archive debt?'} onClose={() => setArchiveTarget(null)}><p className="text-sm text-slate-400">{archiveTarget.creditorName} will {archiveTarget.isArchived ? 'return to active totals' : 'be hidden from active totals'}. The record remains in SQLite.</p><div className="mt-5 flex justify-end gap-2"><Button onClick={() => setArchiveTarget(null)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => void changeArchive(archiveTarget)}>{busy ? 'Saving…' : 'Confirm'}</Button></div></Modal>}
  </div></WorkspaceLayout>
}
