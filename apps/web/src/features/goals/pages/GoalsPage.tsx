import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Goal, GoalContribution } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card, Input } from '../../../components/ui'
import { Select } from '../../../components/ui/FormField'
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
    [account, setAccount] = useState('')
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
        (!account || g.tradingAccountId === account),
    ) ?? []
  return (
    <WorkspaceLayout title="Goals">
      <header className="mb-5 flex flex-wrap justify-between gap-3">
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
              setBatchGoals(undefined)
              setForm(null)
            }}
          >
            Create goal
          </Button>
        )}
      </header>
      {(error || trading.error) && (
        <p role="alert" className="mb-4 text-sm text-rose-300">
          {error || trading.error}
        </p>
      )}
      {!data && !error && <p role="status">Loading goals...</p>}
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <Input
          aria-label="Search goals"
          placeholder="Search goals"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          aria-label="Filter goal period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="">All periods</option>
          {['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
        <Select
          aria-label="Filter linked account"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
        >
          <option value="">All account / combined goals</option>
          {trading.data?.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nickname}
            </option>
          ))}
        </Select>
      </Card>
      {!visible.length && data && (
        <Card className="p-10 text-center text-sm text-slate-400">
          No goals to show. Create a goal or adjust your filters.
        </Card>
      )}
      {data?.goals.some((g) => g.canManage && g.tradingAccountId) && (
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
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {visible.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            contributions={data?.contributions.filter((c) => c.goalId === goal.id) ?? []}
            trading={trading.data}
            selected={selectedGoals.includes(goal.id)}
            onSelect={
              goal.canManage && goal.tradingAccountId && !goal.copyGroupId
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
