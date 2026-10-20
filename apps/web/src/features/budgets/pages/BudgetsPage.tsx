import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { localBillDate } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { FinancialAudit } from '../../../components/financial/FinancialAudit'
import { useNotify } from '../../../components/ui/useNotify'
import { useHousehold } from '../../households/hooks/useHousehold'
import { ManageCategoriesButton } from '../../categories/components/ManageCategoriesButton'
import { useBudgets } from '../hooks/useBudgets'
import { saveBudget, copyBudget } from '../api/budgetClient'
import { BudgetForm } from '../components/BudgetForm'
import { BudgetCopyForm } from '../components/BudgetCopyForm'
import { BudgetTotals } from '../components/BudgetTotals'
import { BudgetCategoryList } from '../components/BudgetCategoryList'
import { BudgetBills } from '../components/BudgetBills'
export function BudgetsPage() {
  const { householdId: home = '' } = useParams(),
    { selected, select, households } = useHousehold(),
    [month, setMonth] = useState(localBillDate().slice(0, 7)),
    [member, setMember] = useState(''),
    [editor, setEditor] = useState<'budget' | 'copy' | null>(null),
    [audit, setAudit] = useState(false),
    { data, error, refresh } = useBudgets(home, month, member),
    notify = useNotify()
  useEffect(() => {
    if (selected?.id !== home && households.some((h) => h.id === home)) select(home)
  }, [home, households, select, selected?.id])
  async function save(body: unknown) {
    if (editor === 'copy') await copyBudget(home, body)
    else await saveBudget(home, body, data?.budget?.id)
    await refresh()
    notify('success', editor === 'copy' ? 'Monthly budget copied' : 'Monthly budget saved')
  }
  return (
    <WorkspaceLayout title="Budgets">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Monthly budgets</h1>
          <p className="mt-1 text-sm text-slate-400">
            Plan purchase spending and track your monthly limits.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <FormField label="Budget month">
            <Input
              type="month"
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value)
              }}
            />
          </FormField>
          <FormField label="Budget scope">
            <Select value={member} onChange={(e) => setMember(e.target.value)}>
              <option value="">Whole household</option>
              {data?.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                  {m.status !== 'active' ? ' (inactive)' : ''}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </header>
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-300">
          {error}
          <Button size="small" onClick={() => void refresh().catch(() => {})}>
            Retry
          </Button>
        </p>
      )}
      {!data && !error && <p role="status">Loading budgets…</p>}
      {data && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {data.budget?.canManage ? (
              <Button variant="primary" onClick={() => setEditor('budget')}>
                {data.budget.status === 'archived' ? 'Restore / edit budget' : 'Edit budget'}
              </Button>
            ) : (
              !data.budget &&
              data.canCreate && (
                <Button variant="primary" onClick={() => setEditor('budget')}>
                  Create budget
                </Button>
              )
            )}
            {!data.budget && data.canCreate && (
              <Button onClick={() => setEditor('copy')}>Copy previous / template month</Button>
            )}
            {data.budget && <Button onClick={() => setAudit(true)}>Audit history</Button>}
            <Button size="small" onClick={() => void refresh().catch(() => {})}>
              Refresh
            </Button>
            <ManageCategoriesButton
              home={home}
              onChanged={async () => {
                await refresh()
              }}
            />
          </div>
          {data.budget?.status === 'archived' && (
            <p className="mb-3 text-sm text-amber-200">
              This budget is archived. Its limits are excluded until restored; actual spending
              remains visible.
            </p>
          )}
          {data.budget && (
            <p className="mb-3 text-xs text-slate-500">
              Created {new Date(data.budget.createdAt).toLocaleString()} · Updated{' '}
              {new Date(data.budget.updatedAt).toLocaleString()}
            </p>
          )}
          <BudgetTotals data={data} />
          <div className="mt-4">
            <BudgetCategoryList rows={data.rows} />
          </div>
          <BudgetBills bills={data.bills} />
          {editor === 'budget' && (
            <BudgetForm
              record={data.budget ?? undefined}
              data={data}
              save={save}
              close={() => setEditor(null)}
            />
          )}
          {editor === 'copy' && (
            <BudgetCopyForm data={data} save={save} close={() => setEditor(null)} />
          )}
          {audit && data.budget && (
            <FinancialAudit
              path={`households/${home}/budgets/${data.budget.id}/audit`}
              close={() => setAudit(false)}
            />
          )}
        </>
      )}
    </WorkspaceLayout>
  )
}
