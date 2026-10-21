import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Goal, GoalContribution } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../../components/ui'
import { FinancialAudit } from '../../../components/financial/FinancialAudit'
import { useNotify } from '../../../components/ui/useNotify'
import { useHousehold } from '../../households/hooks/useHousehold'
import { useAuth } from '../../auth/hooks/useAuth'
import { useTrading } from '../../trading/hooks/useTrading'
import { useGoals } from '../hooks/useGoals'
import { saveGoal, saveGoalBatch } from '../api/goalClient'
import { GoalForm } from '../components/GoalForm'
import { ContributionForm } from '../components/ContributionForm'
import { GoalCard } from '../components/GoalCard'
import { DebtPaymentGoals } from '../components/DebtPaymentGoals'
import { GoalsToolbar } from '../components/GoalsToolbar'
import { goalCategory, sortGoals } from '../goal-display'
export function GoalsPage() {
  const { householdId: home = '' } = useParams(),
    { data, error, refresh } = useGoals(home),
    trading = useTrading(home),
    { households, selected, select } = useHousehold(),
    { user } = useAuth(),
    notify = useNotify(),
    household = households.find((h) => h.id === home),
    [form, setForm] = useState<Goal | null | undefined>(),
    [contribution, setContribution] = useState<{ goal: Goal; entry?: GoalContribution } | null>(
      null,
    ),
    [selectedGoals, setSelectedGoals] = useState<string[]>([]),
    [batchGoals, setBatchGoals] = useState<Goal[] | undefined>(),
    [audit, setAudit] = useState(''),
    [query, setQuery] = useState(''),
    [period, setPeriod] = useState(''),
    [account, setAccount] = useState(''),
    [view, setView] = useState('targets'),
    [selecting, setSelecting] = useState(false),
    [debtCreateVersion, setDebtCreateVersion] = useState(0),
    [category, setCategory] = useState(''),
    [order, setOrder] = useState('due'),
    [grouped, setGrouped] = useState(true)
  useEffect(() => {
    if (household && selected?.id !== home) select(home)
  }, [home, household, selected?.id, select])
  const save = async (body: unknown) => {
    if (
      body &&
      typeof body === 'object' &&
      'values' in body &&
      body.values &&
      typeof body.values === 'object' &&
      'accounts' in body.values
    )
      await saveGoalBatch(home, body)
    else await saveGoal(home, body, contribution?.entry?.id ?? form?.id, !!contribution)
    await refresh()
    notify('success', 'Goal record saved')
  }
  const visible =
    data?.goals.filter(
      (g) =>
        g.name.toLowerCase().includes(query.toLowerCase()) &&
        (!period || g.period === period) &&
        (!account || g.tradingAccountId === account) &&
        (!category || goalCategory(g) === category),
    ) ?? []
  const ordered = sortGoals(visible, order)
  const sections: [string, Goal[]][] = grouped
    ? [...new Set(ordered.map(goalCategory))].map((name) => [
        name,
        ordered.filter((g) => goalCategory(g) === name),
      ])
    : [['', ordered]]
  return (
    <WorkspaceLayout title="Goals">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Goals</h1>
          <p className="mt-2 text-sm text-slate-400">
            Personal targets based on recorded financial activity.
          </p>
        </div>
        {data?.canCreate && (
          <Button
            variant="primary"
            onClick={() => {
              if (view === 'debts') setDebtCreateVersion((n) => n + 1)
              else {
                setBatchGoals(undefined)
                setForm(null)
              }
            }}
          >
            {view === 'debts' ? 'Plan debt payment' : 'Create goal'}
          </Button>
        )}
      </header>
      <nav aria-label="Goal sections" className="mb-4 flex gap-4 border-b border-white/[.08]">
        {[
          ['targets', `Targets${data ? ` (${data.goals.length})` : ''}`],
          ['debts', 'Debt payment plans'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-current={view === value ? 'page' : undefined}
            className={`border-b-2 px-1 pb-3 text-sm ${view === value ? 'border-[#a9b8a9] text-white' : 'border-transparent text-slate-500 hover:text-slate-200'}`}
            onClick={() => setView(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div hidden={view !== 'debts'}>
        <DebtPaymentGoals key={home} home={home} createVersion={debtCreateVersion} />
      </div>
      <div hidden={view !== 'targets'}>
        {(error || trading.error) && (
          <p role="alert" className="mb-4 text-sm text-rose-300">
            {error || trading.error}
          </p>
        )}
        {!data && !error && <p role="status">Loading goals...</p>}
        <GoalsToolbar
          category={category}
          setCategory={setCategory}
          order={order}
          setOrder={setOrder}
          grouped={grouped}
          setGrouped={setGrouped}
          query={query}
          setQuery={setQuery}
          period={period}
          setPeriod={setPeriod}
          account={account}
          setAccount={setAccount}
          trading={trading.data}
          selecting={selecting}
          setSelecting={(value) => {
            setSelecting(value)
            if (!value) setSelectedGoals([])
          }}
          canSelect={!!data?.goals.some((g) => g.canManage && g.tradingAccountId && !g.copyGroupId)}
        />
        {!visible.length && data && (
          <Card className="p-10 text-center text-sm text-slate-400">
            No goals to show. Create a goal or adjust your filters.
          </Card>
        )}
        {selecting && data?.goals.some((g) => g.canManage && g.tradingAccountId) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button
              size="small"
              onClick={() =>
                setSelectedGoals(
                  visible
                    .filter((g) => g.canManage && g.tradingAccountId && !g.copyGroupId)
                    .map((g) => g.id),
                )
              }
            >
              Select account goals
            </Button>
            <Button
              size="small"
              disabled={selectedGoals.length < 2}
              onClick={() => {
                const chosen = data.goals.filter((g) => selectedGoals.includes(g.id))
                setBatchGoals(chosen)
                setForm(chosen[0])
              }}
            >
              Edit selected ({selectedGoals.length})
            </Button>
            {!!selectedGoals.length && (
              <Button size="small" variant="ghost" onClick={() => setSelectedGoals([])}>
                Clear selection
              </Button>
            )}
          </div>
        )}
        {sections.map(([name, goals]) => (
          <section key={name || 'all'} className="mb-5">
            {name && (
              <h2 className="mb-3 text-sm font-semibold">
                {name}{' '}
                <span className="ml-2 text-xs font-normal text-slate-500">{goals.length}</span>
              </h2>
            )}
            <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
              {goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  contributions={data?.contributions.filter((c) => c.goalId === goal.id) ?? []}
                  trading={trading.data}
                  selected={selectedGoals.includes(goal.id)}
                  onSelect={
                    selecting && goal.canManage && goal.tradingAccountId && !goal.copyGroupId
                      ? (checked) =>
                          setSelectedGoals(
                            checked
                              ? [...selectedGoals, goal.id]
                              : selectedGoals.filter((id) => id !== goal.id),
                          )
                      : undefined
                  }
                  onEdit={() => {
                    setBatchGoals(undefined)
                    setForm(goal)
                  }}
                  onContribute={(entry) => setContribution({ goal, entry })}
                  onAudit={setAudit}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      {form !== undefined && (
        <GoalForm
          goal={form ?? undefined}
          batchGoals={batchGoals}
          trading={trading.data}
          allowHousehold={household?.role === 'owner'}
          members={trading.members.filter(
            (m) => household?.role === 'owner' || m.linkedUserId === user?.id,
          )}
          save={save}
          close={() => {
            setForm(undefined)
            setBatchGoals(undefined)
          }}
        />
      )}
      {contribution && (
        <ContributionForm {...contribution} save={save} close={() => setContribution(null)} />
      )}
      {audit && (
        <FinancialAudit
          path={`households/${home}/goals/${audit}/audit`}
          close={() => setAudit('')}
        />
      )}
    </WorkspaceLayout>
  )
}
