import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowRight, Plus, Search } from 'lucide-react'
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
import { DebtEmptyState } from '../components/DebtEmptyState'
import { DebtAccountCard } from '../components/DebtAccountCard'

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
  const archivedCount = debts.filter(debt => debt.isArchived).length
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
  const selectClass = 'h-10 w-full rounded-lg border border-white/10 bg-[#151716] px-3 text-sm text-slate-300 outline-none focus:border-[#a9b8a9]'
  return <WorkspaceLayout title="Debts"><div className="space-y-6">
    <div className="relative overflow-hidden rounded-2xl border border-white/[.09] bg-[radial-gradient(circle_at_88%_10%,rgba(169,187,168,.13),transparent_35%),linear-gradient(115deg,#222823,#191d1a_70%)] px-6 py-8 shadow-[0_22px_45px_-35px_rgba(0,0,0,.8)] sm:px-9 sm:py-10">
      <div className="pointer-events-none absolute -bottom-28 right-16 h-52 w-52 rounded-full border border-[#a9b8a9]/[.09] sm:h-72 sm:w-72" />
      <div className="relative flex flex-wrap items-end justify-between gap-6"><div><div className="flex items-center gap-3"><span className="h-px w-6 bg-[#aab9a9]"/><p className="text-[10px] font-semibold uppercase tracking-[.23em] text-[#aab9a9]">Household finances</p></div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#f1f2ee] sm:text-4xl">Debts</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">A complete view of your household obligations, the people responsible, and what still needs to be verified.</p></div>
        {!loading && !error && summary.accountCount > 0 && canWrite && <Button variant="primary" className="gap-2" onClick={() => setFormDebt(null)}><Plus size={16}/> Add debt</Button>}
      </div>
    </div>
    {loading ? <Card className="p-8 text-sm text-slate-400" role="status">Loading debts…</Card> : error ? <Card className="p-6"><p role="alert" className="text-rose-300">{error}</p><Button className="mt-3" onClick={() => window.location.reload()}>Try again</Button></Card> : summary.accountCount === 0 && !showArchived ?
      <DebtEmptyState canAdd={canWrite} archivedCount={archivedCount} onAdd={() => setFormDebt(null)} onShowArchived={() => setShowArchived(true)} /> : <>
      {summary.accountCount > 0 && <DebtSummary summary={summary} members={members} />}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#9eaf9d]">Account register</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{showArchived ? 'Archived debts' : 'Your accounts'}</h2></div><p className="text-xs text-slate-500">{visible.length} {visible.length === 1 ? 'account' : 'accounts'} shown</p></div>
      <Card className="p-4 sm:p-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,2fr)_repeat(4,minmax(130px,1fr))]"><div className="relative sm:col-span-2 xl:col-span-1"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-500"/><Input aria-label="Search debts" placeholder="Search creditor or nickname" value={query} onChange={event => setQuery(event.target.value)} className="pl-10" /></div>
        <select aria-label="Filter by member" className={selectClass} value={memberFilter} onChange={event => setMemberFilter(event.target.value)}><option value="">All members</option>{members.map(member => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select>
        <select aria-label="Filter by type" className={selectClass} value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="">All types</option>{Object.entries(debtTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Filter by payment status" className={selectClass} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All statuses</option>{Object.entries(paymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Sort debts" className={selectClass} value={sort} onChange={event => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="balance">Highest balance</option><option value="creditor">Creditor name</option></select></div>
        <label className="mt-4 flex items-center gap-2 border-t border-white/[.06] pt-3 text-xs text-slate-400"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)}/>Show archived{archivedCount ? ` (${archivedCount})` : ''}</label></Card>
      {visible.length ? <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{visible.map(debt => <DebtAccountCard key={debt.id} debt={debt} members={members} canEdit={!debt.isArchived && canManage(debt)} canArchive={canManage(debt, true)} onView={() => setDetail(debt)} onEdit={() => setFormDebt(debt)} onArchive={() => setArchiveTarget(debt)} />)}</div>
      : <Card className="flex flex-col items-center px-6 py-12 text-center"><span className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-slate-400"><Search size={22}/></span><h3 className="mt-4 font-medium">No matching accounts</h3><p className="mt-1 text-sm text-slate-400">Try a different search or filter.</p><Button variant="ghost" className="mt-4 gap-1" onClick={() => { setQuery(''); setMemberFilter(''); setTypeFilter(''); setStatusFilter('') }}>Clear filters <ArrowRight size={14}/></Button></Card>}
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
