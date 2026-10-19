import { Link } from 'react-router-dom'
import { Card } from '../../../components/ui'
import { toneStyles } from '../../../components/ui/semantic-tones'
import { OverviewGoalRow } from './OverviewGoalRow'
import { WeeklyGoalSummary } from './WeeklyGoalSummary'
import { useGoals } from '../../goals/hooks/useGoals'

export function OverviewGoals({ home }: { home: string }) {
  const { data, error } = useGoals(home)
  const goals = data?.goals.filter((goal) => goal.status === 'active') ?? []
  return (
    <Card className="min-w-0 p-4">
      <section aria-label="Goal progress">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Goals</h2>
          <Link className="text-xs text-slate-400 hover:underline" to={`/households/${home}/goals`}>
            View goals
          </Link>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Current goal periods, independent of the reporting month. Trading profit is not deposited
          income.
        </p>
        {error ? (
          <p role="alert" className={`mt-3 text-sm ${toneStyles.negative.text}`}>
            Could not load goals: {error}
          </p>
        ) : !data ? (
          <p role="status" className="mt-3 text-sm text-slate-400">
            Loading goals…
          </p>
        ) : goals.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No active goals yet.</p>
        ) : (
          <div className="mt-3">
            <WeeklyGoalSummary goals={goals} />
            <p className="mb-3 text-[11px] text-slate-500">
              Daily average = weekly net P&amp;L � 5 planned trading days, including losses and
              fees. Unrecorded days do not reduce the divisor.
            </p>
            <ul className="max-h-80 divide-y divide-white/[.07] overflow-y-auto pr-1">
              {goals.map((goal) => (
                <OverviewGoalRow key={goal.id} goal={goal} />
              ))}
            </ul>
          </div>
        )}
      </section>
    </Card>
  )
}
