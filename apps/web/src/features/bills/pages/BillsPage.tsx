import { useRequestedRecord } from '../../../lib/useRequestedRecord'
import { useCategories } from '../../categories/hooks/useCategories'
import { CategoryManager } from '../../categories/components/CategoryManager'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  calculateBillSummary,
  billPlanningTotals,
  type BillAction,
  type BillView,
} from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../../components/ui'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { useNotify } from '../../../components/ui/useNotify'
import { useLocalToday } from '../../../lib/useLocalToday'
import { errorMessage } from '../../../lib/api'
import { useHousehold } from '../../households/hooks/useHousehold'
import { applyBillAction, createBill, requestBillAction } from '../api/billClient'
import { BillForm } from '../components/BillForm'
import { BillList } from '../components/BillList'
import { BillDetails } from '../components/BillDetails'
import { useBills } from '../hooks/useBills'
import { BillApprovals } from '../components/BillApprovals'
import { BillsToolbar } from '../components/BillsToolbar'
import { BillsSummary } from '../components/BillsSummary'

export function BillsPage() {
  const today = useLocalToday()
  const { householdId = '' } = useParams(),
    { households, selected, select } = useHousehold(),
    household = households.find((item) => item.id === householdId),
    notify = useNotify()
  const {
    bills,
    debts,
    planner,
    members,
    requests,
    error,
    setError,
    loading,
    refresh: load,
  } = useBills(householdId)
  const { categories, refresh: refreshCategories } = useCategories(householdId)
  const [form, setForm] = useState<BillView | null | undefined>(undefined),
    [detailId, setDetailId] = useState('')
  const [startPayment, setStartPayment] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [kind, setKind] = useState('recurring'),
    [query, setQuery] = useState(''),
    [member, setMember] = useState(''),
    [category, setCategory] = useState('')
  useEffect(() => {
    if (household && selected?.id !== householdId) select(householdId)
  }, [household, householdId, selected?.id, select])
  useRequestedRecord(bills, (bill) => setDetailId(bill.id))
  async function act(bill: BillView, action: BillAction, reason?: string) {
    if (bill.requiresApproval) {
      const explanation = reason ?? prompt('Reason for Owner approval')
      if (!explanation?.trim()) throw new Error('A reason is required')
      await requestBillAction(householdId, bill.id, action, explanation, crypto.randomUUID())
      notify('success', 'Request sent to the Owner')
    } else {
      await applyBillAction(householdId, bill.id, action)
      notify('success', 'Bill updated')
    }
    await load()
  }
  const summary = calculateBillSummary(bills, debts, today),
    detail = bills.find((item) => item.id === detailId)
  const planningTotals = planner ? billPlanningTotals(planner, today) : null
  const visible = bills.filter(
    (item) =>
      item.kind === kind &&
      `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()) &&
      (!member || item.memberIds.includes(member)) &&
      (!category || item.categoryId === category),
  )
  return (
    <WorkspaceLayout title="Bills">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Bills</h1>
          <p className="mt-2 text-sm text-slate-400">
            Plan obligations. Record actual bills and payments separately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {household?.role !== 'viewer' && (
            <Button variant="primary" onClick={() => setForm(null)}>
              Add bill
            </Button>
          )}
          <ActionMenu
            label="Bill page actions"
            items={[{ label: 'Manage categories', onSelect: () => setCategoriesOpen(true) }]}
          />
        </div>
      </header>
      <BillsSummary
        totals={planningTotals}
        month={today.slice(0, 7)}
        overdueCount={summary.overdueCount}
        unknownRecurringCount={summary.unknownRecurringCount}
      />
      <div className="mb-5">
        <BillApprovals
          home={householdId}
          requests={requests}
          owner={household?.role === 'owner'}
          refresh={load}
          members={members}
          debts={debts}
        />
      </div>
      <BillsToolbar
        kind={kind}
        setKind={setKind}
        query={query}
        setQuery={setQuery}
        member={member}
        setMember={setMember}
        category={category}
        setCategory={setCategory}
        members={members}
        categories={categories}
      />
      {error && (
        <Card className="mb-4 p-5">
          <p role="alert" className="text-rose-300">
            {error}
          </p>
          <Button
            className="mt-3"
            onClick={() => void load().catch((failure) => setError(errorMessage(failure)))}
          >
            Retry
          </Button>
        </Card>
      )}
      {loading ? (
        <p role="status">Loading bills…</p>
      ) : (
        <BillList
          bills={visible}
          categories={categories}
          onView={(bill) => {
            setStartPayment(false)
            setDetailId(bill.id)
          }}
          onPay={(bill) => {
            setStartPayment(true)
            setDetailId(bill.id)
          }}
          onEdit={setForm}
          onArchive={(bill) => {
            if (
              confirm(
                bill.kind === 'recurring'
                  ? 'Deactivate this recurring bill?'
                  : 'Cancel this one-time bill?',
              )
            )
              void act(bill, { action: 'archive_bill' }).catch((failure) =>
                notify('error', errorMessage(failure)),
              )
          }}
        />
      )}
      {categoriesOpen && (
        <CategoryManager
          home={householdId}
          onClose={() => setCategoriesOpen(false)}
          onChanged={async () => {
            await refreshCategories()
            await load()
          }}
        />
      )}
      {form !== undefined && (
        <BillForm
          bill={form ?? undefined}
          debts={debts}
          members={members}
          close={() => setForm(undefined)}
          save={async (input, reason) => {
            if (form) await act(form, { action: 'edit_bill', changes: input }, reason)
            else {
              await createBill(householdId, input)
              notify('success', 'Bill saved')
              await load()
            }
          }}
        />
      )}
      {detail && (
        <BillDetails
          key={detail.id}
          startPayment={startPayment}
          bill={detail}
          close={() => setDetailId('')}
          act={(action) => act(detail, action)}
          changed={async () => {
            notify('success', 'Payment saved')
            await load()
          }}
        />
      )}
    </WorkspaceLayout>
  )
}
