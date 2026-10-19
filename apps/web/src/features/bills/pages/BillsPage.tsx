import { useCategories } from '../../categories/hooks/useCategories'
import { ManageCategoriesButton } from '../../categories/components/ManageCategoriesButton'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  calculateBillSummary,
  localBillDate,
  type BillAction,
  type BillView,
} from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card, Input } from '../../../components/ui'
import { Select } from '../../../components/ui/FormField'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { formatMoney } from '../../../lib/money'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { useHousehold } from '../../households/hooks/useHousehold'
import { applyBillAction, createBill, requestBillAction } from '../api/billClient'
import { BillForm } from '../components/BillForm'
import { BillList } from '../components/BillList'
import { BillDetails } from '../components/BillDetails'
import { useBills } from '../hooks/useBills'
import { BillApprovals } from '../components/BillApprovals'

export function BillsPage() {
  const { householdId = '' } = useParams(),
    { households, selected, select } = useHousehold(),
    household = households.find((item) => item.id === householdId),
    notify = useNotify()
  const {
    bills,
    debts,
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
  const [kind, setKind] = useState('recurring'),
    [query, setQuery] = useState(''),
    [member, setMember] = useState(''),
    [category, setCategory] = useState('')
  useEffect(() => {
    if (household && selected?.id !== householdId) select(householdId)
  }, [household, householdId, selected?.id, select])
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
  const summary = calculateBillSummary(bills, debts, localBillDate()),
    detail = bills.find((item) => item.id === detailId)
  const visible = bills.filter(
    (item) =>
      item.kind === kind &&
      `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()) &&
      (!member || item.memberIds.includes(member)) &&
      (!category || item.categoryId === category),
  )
  return (
    <WorkspaceLayout title="Bills">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Bills</h1>
          <p className="mt-2 text-sm text-slate-400">
            Plan obligations. Record actual bills and payments separately.
          </p>
        </div>
        {household?.role !== 'viewer' && (
          <Button variant="primary" onClick={() => setForm(null)}>
            Add bill
          </Button>
        )}
      </header>
      <div className="mb-4">
        <ManageCategoriesButton
          home={householdId}
          onChanged={async () => {
            await refreshCategories()
            await load()
          }}
        />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat
          label="Monthly bills"
          tone="info"
          amount={formatMoney(summary.standaloneMonthlyCents)}
          detail="Known / estimated, excludes linked debt"
        />
        <SummaryStat
          label="Bills + debt obligations"
          tone="info"
          amount={formatMoney(summary.householdMonthlyObligationsCents)}
          detail="Monthly equivalent; debt links counted once"
        />
        <SummaryStat
          label="Actual remaining"
          tone="warning"
          amount={formatMoney(
            summary.unknownPeriodCount && !summary.confirmedPeriodCount
              ? null
              : summary.outstandingCents,
          )}
          detail={
            summary.unknownPeriodCount
              ? `${summary.unknownPeriodCount} bill totals unconfirmed; excluded`
              : 'Generated periods with confirmed amounts'
          }
        />
        <SummaryStat
          label="Overdue periods"
          tone={summary.overdueCount > 0 ? 'negative' : 'neutral'}
          amount={String(summary.overdueCount)}
          detail={`${summary.unknownRecurringCount} unknown recurring amounts`}
        />
      </div>
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
      <Card className="mb-4 p-4">
        <div className="mb-4 flex gap-2">
          {[
            ['recurring', 'Recurring bills'],
            ['one_time', 'One-time bills'],
          ].map(([value, label]) => (
            <Button
              key={value}
              aria-pressed={kind === value}
              variant={kind === value ? 'primary' : 'ghost'}
              onClick={() => setKind(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            aria-label="Search bills"
            placeholder="Search bills"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            aria-label="Filter member"
            value={member}
            onChange={(e) => setMember(e.target.value)}
          >
            <option value="">All members</option>
            {members.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.archived ? ' (archived)' : ''}
              </option>
            ))}
          </Select>
        </div>
      </Card>
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
