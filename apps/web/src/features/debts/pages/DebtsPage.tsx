import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import {
  calculateDebtSummary,
  type Debt,
  type DebtInput,
  type HouseholdMember,
} from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { listMembers } from '../../households/api/householdClient'
import { useHousehold } from '../../households/hooks/useHousehold'
import { useAuth } from '../../auth/hooks/useAuth'
import { submitDebtChange } from '../api/changeClient'
import { archiveDebt, createDebt, listDebts, restoreDebt, updateDebt } from '../api/debtClient'
import { DebtFormDialog } from '../components/DebtFormDialog'
import { DebtSummary } from '../components/DebtSummary'
import { DebtBreakdown } from '../components/DebtBreakdown'
import { DebtFilters } from '../components/DebtFilters'
import { emptyDebtFilters } from '../lib/debt-filters'
import { DebtEmptyState } from '../components/DebtEmptyState'
import { DebtAccountGroups } from '../components/DebtAccountGroups'
import { groupDebts } from '../lib/debt-groups'
import { DebtAccountCard } from '../components/DebtAccountCard'
import { DebtDetailsDialog } from '../components/DebtDetailsDialog'
import { DebtChangeRequestsPanel } from '../components/DebtChangeRequestsPanel'

export function DebtsPage() {
  const { householdId = '' } = useParams()
  const { households, selected, select } = useHousehold()
  const household = households.find((item) => item.id === householdId)
  const notify = useNotify()
  const { user } = useAuth()
  const [debts, setDebts] = useState<Debt[]>([])
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formDebt, setFormDebt] = useState<Debt | null | undefined>(undefined)
  const [detail, setDetail] = useState<Debt | null>(null)
  const [recordPayment, setRecordPayment] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Debt | null>(null)
  const [busy, setBusy] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [archiveRequestKey, setArchiveRequestKey] = useState('')
  const [filters, setFilters] = useState(emptyDebtFilters)
  const { query, member: memberFilter, type: typeFilter, status: statusFilter, sort } = filters
  const [showArchived, setShowArchived] = useState(false)
  const [requestRefresh, setRequestRefresh] = useState(0)
  useEffect(() => {
    if (household && selected?.id !== householdId) select(householdId)
  }, [household, householdId, selected?.id, select])
  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([listDebts(householdId), listMembers(householdId)])
      .then(([results, people]) => {
        if (active) {
          setDebts(results.debts)
          setMembers(people.members)
          setError('')
        }
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [householdId])
  const summary = useMemo(() => calculateDebtSummary(debts), [debts])
  const visible = useMemo(
    () =>
      debts
        .filter(
          (debt) =>
            debt.isArchived === showArchived &&
            `${debt.creditorName} ${debt.accountNickname ?? ''} ${debt.collectionAgency ?? ''}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            (!memberFilter ||
              debt.memberAssignments.some((item) => item.memberId === memberFilter)) &&
            (!typeFilter || debt.accountType === typeFilter) &&
            (!statusFilter || debt.paymentStatus === statusFilter),
        )
        .sort((a, b) =>
          sort === 'balance'
            ? (b.currentBalanceCents ?? -1) - (a.currentBalanceCents ?? -1)
            : sort === 'creditor'
              ? a.creditorName.localeCompare(b.creditorName)
              : b.updatedAt.localeCompare(a.updatedAt),
        ),
    [debts, showArchived, query, memberFilter, typeFilter, statusFilter, sort],
  )
  const groups = useMemo(() => groupDebts(visible), [visible])
  if (!household)
    return (
      <WorkspaceLayout title="Debts">
        <Card className="p-6">Household not found.</Card>
      </WorkspaceLayout>
    )
  const currentMember = members.find(
    (member) => member.linkedUserId === user?.id && member.status === 'active',
  )
  const canWrite = household.role !== 'viewer'
  const archivedCount = debts.filter((debt) => debt.isArchived).length
  function canManage(debt: Debt, archive = false) {
    if (household?.role === 'owner') return true
    if (household?.role === 'viewer' || !user) return false
    const ownerExclusive = debt.memberAssignments.every(
      (item) => members.find((member) => member.id === item.memberId)?.accessRole === 'owner',
    )
    if (
      ownerExclusive ||
      (debt.createdByUserId !== user.id &&
        !debt.memberAssignments.some((item) => item.memberId === currentMember?.id))
    )
      return false
    return (
      !archive ||
      household?.role !== 'editor' ||
      debt.memberAssignments.every((item) => item.memberId === currentMember?.id)
    )
  }
  function requiresApproval(debt: Debt) {
    return (
      household?.role !== 'owner' &&
      canManage(debt) &&
      debt.memberAssignments.some(
        (item) => members.find((member) => member.id === item.memberId)?.accessRole === 'owner',
      )
    )
  }
  function canModifyPayment(debt: Debt) {
    return (
      canManage(debt) &&
      (household?.role === 'owner' ||
        !debt.memberAssignments.some(
          (item) => members.find((member) => member.id === item.memberId)?.accessRole === 'owner',
        ))
    )
  }
  async function refreshDetail() {
    setRequestRefresh((value) => value + 1)
    const updated = (await listDebts(householdId)).debts
    setDebts(updated)
    setDetail((current) =>
      current ? (updated.find((item) => item.id === current.id) ?? current) : null,
    )
  }
  async function save(input: DebtInput, reason?: string, requestKey?: string) {
    if (formDebt && requiresApproval(formDebt)) {
      const changes = Object.fromEntries(
        Object.entries(input).filter(
          ([key, value]) => JSON.stringify(value) !== JSON.stringify(formDebt[key as keyof Debt]),
        ),
      )
      if (!Object.keys(changes).length) throw new Error('Enter at least one change')
      await submitDebtChange(householdId, formDebt.id, {
        action: 'edit_account',
        changes,
        reason: reason ?? '',
        idempotencyKey: requestKey!,
      })
      setRequestRefresh((value) => value + 1)
      notify('success', 'Account changes submitted for Owner approval')
      return
    }
    if (formDebt) await updateDebt(householdId, formDebt.id, input)
    else await createDebt(householdId, input)
    setDebts((await listDebts(householdId)).debts)
    notify('success', formDebt ? 'Debt updated' : 'Debt added')
  }
  async function changeArchive(target: Debt) {
    setBusy(true)
    try {
      if (requiresApproval(target)) {
        await submitDebtChange(householdId, target.id, {
          action: target.isArchived ? 'restore_account' : 'archive_account',
          reason: archiveReason.trim(),
          idempotencyKey: archiveRequestKey,
        })
        setRequestRefresh((value) => value + 1)
        notify('success', 'Submitted for Owner approval')
        setArchiveTarget(null)
        return
      }
      if (target.isArchived) await restoreDebt(householdId, target.id)
      else await archiveDebt(householdId, target.id)
      setDebts((await listDebts(householdId)).debts)
      notify('success', target.isArchived ? 'Debt restored' : 'Debt archived')
      setArchiveTarget(null)
    } catch (failure) {
      notify('error', errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <WorkspaceLayout title="Debts">
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4 pb-1">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#f1f2ee]">Debts</h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage your household accounts and balances.
            </p>
          </div>
          {!loading && !error && summary.accountCount > 0 && canWrite && (
            <Button variant="primary" className="gap-2" onClick={() => setFormDebt(null)}>
              <Plus size={15} />
              Add debt
            </Button>
          )}
        </header>
        {household.role === 'owner' && (
          <DebtChangeRequestsPanel
            householdId={householdId}
            owner
            members={members}
            debts={debts}
            refreshToken={requestRefresh}
            onChanged={refreshDetail}
            hideEmpty
          />
        )}
        {household.role !== 'owner' && household.role !== 'viewer' && (
          <DebtChangeRequestsPanel
            householdId={householdId}
            owner={false}
            members={members}
            debts={debts}
            refreshToken={requestRefresh}
            onChanged={refreshDetail}
            hideEmpty
          />
        )}
        {loading ? (
          <Card className="p-8 text-sm text-slate-400" role="status">
            Loading debts…
          </Card>
        ) : error ? (
          <Card className="p-6">
            <p role="alert" className="text-rose-300">
              {error}
            </p>
            <Button className="mt-3" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </Card>
        ) : summary.accountCount === 0 && !showArchived ? (
          <DebtEmptyState
            canAdd={canWrite}
            archivedCount={archivedCount}
            onAdd={() => setFormDebt(null)}
            onShowArchived={() => setShowArchived(true)}
          />
        ) : (
          <>
            {summary.accountCount > 0 && <DebtSummary summary={summary} />}
            <Card>
              <DebtFilters
                value={filters}
                onChange={setFilters}
                members={members}
                showArchived={showArchived}
                onArchivedChange={setShowArchived}
                archivedCount={archivedCount}
                count={visible.length}
              />
            </Card>
            {visible.length ? (
              <DebtAccountGroups
                groups={groups}
                archived={showArchived}
                renderAccount={(debt) => (
                  <DebtAccountCard
                    key={debt.id}
                    debt={debt}
                    members={members}
                    canEdit={!debt.isArchived && canManage(debt)}
                    canArchive={canManage(debt, true) || requiresApproval(debt)}
                    requestMode={requiresApproval(debt)}
                    onView={() => {
                      setRecordPayment(false)
                      setDetail(debt)
                    }}
                    onRecordPayment={
                      !debt.isArchived && canManage(debt)
                        ? () => {
                            setRecordPayment(true)
                            setDetail(debt)
                          }
                        : undefined
                    }
                    onEdit={() => setFormDebt(debt)}
                    onArchive={() => {
                      setArchiveTarget(debt)
                      setArchiveReason('')
                      setArchiveRequestKey(crypto.randomUUID())
                    }}
                  />
                )}
              />
            ) : (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <Search size={22} className="text-slate-500" />
                <h3 className="mt-4 font-medium">No matching accounts</h3>
                <p className="mt-1 text-sm text-slate-400">Try a different search or filter.</p>
                <Button
                  variant="ghost"
                  className="mt-4"
                  onClick={() => setFilters(emptyDebtFilters)}
                >
                  Clear filters
                </Button>
              </div>
            )}
            {summary.accountCount > 0 && <DebtBreakdown summary={summary} members={members} />}
          </>
        )}
        {formDebt !== undefined && (
          <DebtFormDialog
            key={formDebt?.id ?? 'new'}
            debt={formDebt}
            members={members}
            debts={debts}
            role={household.role}
            currentMemberId={currentMember?.id}
            requestMode={Boolean(formDebt && requiresApproval(formDebt))}
            onClose={() => setFormDebt(undefined)}
            onSave={save}
          />
        )}
        {detail && (
          <DebtDetailsDialog
            key={detail.id}
            recordPayment={recordPayment}
            householdId={householdId}
            debt={detail}
            members={members}
            debts={debts}
            owner={household.role === 'owner'}
            canCreate={!detail.isArchived && canManage(detail)}
            canModify={!detail.isArchived && canModifyPayment(detail)}
            onClose={() => setDetail(null)}
            onDebtChanged={refreshDetail}
          />
        )}
        {archiveTarget && (
          <Modal
            title={archiveTarget.isArchived ? 'Restore debt?' : 'Archive debt?'}
            onClose={() => setArchiveTarget(null)}
          >
            <p className="text-sm text-slate-400">
              {archiveTarget.creditorName} will{' '}
              {archiveTarget.isArchived
                ? 'return to active totals'
                : 'be hidden from active totals'}
              . The record remains in SQLite.
            </p>
            {requiresApproval(archiveTarget) && (
              <label className="mt-4 block text-xs text-slate-400">
                Reason for Owner approval
                <textarea
                  required
                  maxLength={2000}
                  value={archiveReason}
                  onChange={(event) => setArchiveReason(event.target.value)}
                  className="mt-2 h-20 w-full rounded-lg border border-white/10 bg-[#151716] p-3 text-sm"
                />
                <span className="mt-2 block">
                  The account stays unchanged until the Owner approves.
                </span>
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setArchiveTarget(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={busy || (requiresApproval(archiveTarget) && !archiveReason.trim())}
                onClick={() => void changeArchive(archiveTarget)}
              >
                {busy
                  ? 'Saving…'
                  : requiresApproval(archiveTarget)
                    ? 'Request approval'
                    : 'Confirm'}
              </Button>
            </div>
          </Modal>
        )}
      </div>
    </WorkspaceLayout>
  )
}
