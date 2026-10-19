import { ManageCategoriesButton } from '../../categories/components/ManageCategoriesButton'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { localBillDate, sumCents, type Expense } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { formatMoney } from '../../../lib/money'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { useHousehold } from '../../households/hooks/useHousehold'
import { saveExpense, voidExpense } from '../api/expenseClient'
import { useExpenses } from '../hooks/useExpenses'
import { ExpenseForm } from '../components/ExpenseForm'
import { useAuth } from '../../auth/hooks/useAuth'
import { ExpenseDetails } from '../components/ExpenseDetails'
import { SpendingBreakdown } from '../components/SpendingBreakdown'

export function ExpensesPage() {
  const { user } = useAuth()
  const { householdId = '' } = useParams(),
    { households, selected, select } = useHousehold(),
    home = households.find((item) => item.id === householdId),
    notify = useNotify()
  const {
    expenses,
    categories,
    members,
    debts,
    loading,
    error,
    setError,
    refresh: load,
  } = useExpenses(householdId)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<Expense | null | undefined>(undefined),
    [detail, setDetail] = useState<Expense | null>(null)
  const [month, setMonth] = useState(localBillDate().slice(0, 7)),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [member, setMember] = useState(''),
    [showVoided, setShowVoided] = useState(false)
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('')
  useEffect(() => {
    if (home && selected?.id !== householdId) select(householdId)
  }, [home, householdId, selected?.id, select])
  const filtered = expenses
    .filter(
      (item) =>
        (showVoided || !item.voided) &&
        item.transactionDate.startsWith(month) &&
        (!from || item.transactionDate >= from) &&
        (!to || item.transactionDate <= to) &&
        `${item.description} ${item.merchant ?? ''}`.toLowerCase().includes(query.toLowerCase()) &&
        (!category || item.allocations.some((part) => part.categoryId === category)) &&
        (!member || item.responsibleMemberId === member),
    )
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
  const active = filtered.filter((item) => !item.voided && item.transactionDate <= localBillDate())
  return (
    <WorkspaceLayout title="Expenses">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Expenses</h1>
          <p className="mt-2 text-sm text-slate-400">
            Everyday purchases, separate from bills and debt repayments.
          </p>
        </div>
        {home?.role !== 'viewer' && (
          <Button variant="primary" disabled={loading || !!error} onClick={() => setForm(null)}>
            Add expense
          </Button>
        )}
      </header>
      <div className="mb-4">
        <ManageCategoriesButton home={householdId} onChanged={load} />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <SummaryStat
          label="Monthly purchases"
          amount={formatMoney(sumCents(active.map((item) => item.amountCents)))}
          detail="Everyday expenses in this selection"
        />
        <SummaryStat
          label="Paid without credit"
          amount={formatMoney(
            sumCents(
              active
                .filter((item) => item.paymentMethod !== 'credit_card')
                .map((item) => item.amountCents),
            ),
          )}
          detail="No bank balances are changed"
        />
        <SummaryStat
          label="Credit-card purchases"
          amount={formatMoney(
            sumCents(
              active
                .filter((item) => item.paymentMethod === 'credit_card')
                .map((item) => item.amountCents),
            ),
          )}
          detail="Repayments are not another purchase"
        />
      </div>
      <Card className="mb-5 space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="Month">
            <Input type="month" required value={month} onChange={(e) => setMonth(e.target.value)} />
          </FormField>
          <FormField label="Search">
            <Input
              placeholder="Merchant or description"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </FormField>
          <FormField label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Member">
            <Select value={member} onChange={(e) => setMember(e.target.value)}>
              <option value="">All members</option>
              {members.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <details>
          <summary className="cursor-pointer text-xs text-slate-400">
            Date range and voided records
          </summary>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <FormField label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </FormField>
            <FormField label="Through">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </FormField>
            <label className="py-2 text-sm">
              <input
                className="mr-2"
                type="checkbox"
                checked={showVoided}
                onChange={(e) => setShowVoided(e.target.checked)}
              />
              Show voided
            </label>
          </div>
        </details>
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
      <Card className="mb-5 divide-y divide-white/10">
        {loading ? (
          <p role="status" className="p-6">
            Loading expenses…
          </p>
        ) : !filtered.length ? (
          <p className="p-10 text-center text-sm text-slate-400">No expenses to show.</p>
        ) : (
          filtered.map((item) => (
            <article
              key={item.id}
              className={`flex flex-wrap items-center justify-between gap-4 p-5 ${item.voided ? 'opacity-60' : ''}`}
            >
              <div>
                <h2 className="font-semibold">
                  {item.description}
                  {item.voided ? ' · Voided' : ''}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {item.transactionDate} · {item.merchant ?? 'No merchant'} ·{' '}
                  {members.find((member) => member.id === item.responsibleMemberId)?.fullName}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold tabular-nums">{formatMoney(item.amountCents)}</span>
                <Button size="small" onClick={() => setDetail(item)}>
                  View
                </Button>
                {item.canManage && !item.voided && (
                  <>
                    <Button size="small" onClick={() => setForm(item)}>
                      Edit
                    </Button>
                    <Button
                      size="small"
                      disabled={busy}
                      onClick={async () => {
                        if (busy || !confirm('Void this expense? Its audit history will remain.'))
                          return
                        setBusy(true)
                        try {
                          await voidExpense(householdId, item)
                          notify('success', 'Expense voided')
                          await load()
                        } catch (failure) {
                          notify('error', errorMessage(failure))
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      Void
                    </Button>
                  </>
                )}
              </div>
            </article>
          ))
        )}
      </Card>
      <SpendingBreakdown expenses={active} categories={categories} members={members} />
      {form !== undefined && (
        <ExpenseForm
          expense={form ?? undefined}
          members={members
            .filter(
              (member) =>
                home?.role === 'owner' ||
                (member.accessRole !== 'owner' &&
                  (home?.role !== 'editor' ||
                    member.linkedUserId === user?.id ||
                    member.id === form?.responsibleMemberId)),
            )
            .sort(
              (a, b) => Number(b.linkedUserId === user?.id) - Number(a.linkedUserId === user?.id),
            )}
          categories={categories}
          debts={debts}
          close={() => setForm(undefined)}
          save={async (input, key) => {
            await saveExpense(householdId, input, key, form ?? undefined)
            notify('success', form ? 'Expense corrected' : 'Expense saved')
            await load()
          }}
        />
      )}
      {detail && (
        <ExpenseDetails
          expense={detail}
          categories={categories}
          members={members}
          close={() => setDetail(null)}
        />
      )}
    </WorkspaceLayout>
  )
}
