import { Link } from 'react-router-dom'
import type { Goal } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { toneStyles, type SemanticTone } from '../../../components/ui/semantic-tones'
import { formatMoney } from '../../../lib/money'
import { useGoals } from '../../goals/hooks/useGoals'

function GoalRow({ goal }: { goal: Goal }) {
  const p = goal.progress
  const tone: SemanticTone = p.notStarted
    ? 'info'
    : p.incomplete || p.actualCents === null
      ? 'warning'
      : p.met
        ? 'positive'
        : goal.direction === 'at_most'
          ? 'negative'
          : 'info'
  const percent =
    p.actualCents === null || goal.targetCents === 0
      ? 0
      : Math.min(100, Math.max(0, (p.actualCents / goal.targetCents) * 100))
  const label = p.notStarted
    ? 'Not started'
    : p.incomplete || p.actualCents === null
      ? 'Incomplete data'
      : p.met
        ? goal.direction === 'at_most'
          ? 'Within limit'
          : 'Target met'
        : goal.direction === 'at_most'
          ? 'Limit exceeded'
          : 'In progress'
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 break-words text-sm font-medium">{goal.name}</h3>
        <StatusBadge status="goal progress" tone={tone} label={label} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        <span className="capitalize">{goal.period}</span> · {p.startDate} – {p.endDate}
      </p>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs">
        <span className={toneStyles[tone].text}>
          {p.notStarted ? `Starts ${p.startDate}` : `${formatMoney(p.actualCents)} recorded`}
        </span>
        <span>Target {formatMoney(goal.targetCents)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${goal.name} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.notStarted || p.actualCents === null ? undefined : percent}
        aria-valuetext={
          p.notStarted
            ? `Not started; starts ${p.startDate}`
            : `${formatMoney(p.actualCents)} of ${formatMoney(goal.targetCents)}`
        }
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.07]"
      >
        <div className={`h-full ${toneStyles[tone].bar}`} style={{ width: `${percent}%` }} />
      </div>
    </li>
  )
}

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
          <ul className="mt-3 max-h-80 divide-y divide-white/[.07] overflow-y-auto pr-1">
            {goals.map((goal) => (
              <GoalRow key={goal.id} goal={goal} />
            ))}
          </ul>
        )}
      </section>
    </Card>
  )
}
