import { weeklyGoalMetrics, type Goal } from '@goxfinance/shared'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { toneStyles, type SemanticTone } from '../../../components/ui/semantic-tones'
import { formatMoney } from '../../../lib/money'
import { WeeklyGoalAmounts, plannedTradingDays } from './WeeklyGoalSummary'

export function OverviewGoalRow({ goal }: { goal: Goal }) {
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
      {goal.period === 'weekly' &&
        goal.goalType === 'trading_profit' &&
        goal.direction === 'at_least' && (
          <WeeklyGoalAmounts
            metrics={weeklyGoalMetrics(goal, plannedTradingDays)}
            notStarted={p.notStarted}
          />
        )}
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
