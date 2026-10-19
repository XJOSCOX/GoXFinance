import { weeklyTradingGoalGroups, type Goal, type weeklyGoalMetrics } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'
import { toneStyles } from '../../../components/ui/semantic-tones'

// The household requested a five-trading-day weekly pace, not an entered-session average.
export const plannedTradingDays = 5
type Metrics = ReturnType<typeof weeklyGoalMetrics>
export function WeeklyGoalAmounts({
  metrics,
  notStarted,
}: {
  metrics: Metrics
  notStarted: boolean
}) {
  const unavailable = notStarted ? 'Not started' : 'Incomplete data'
  return (
    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
      <div>
        <dt className="text-slate-500">Actual daily average</dt>
        <dd
          className={
            toneStyles[
              metrics.dailyAverageCents !== null && metrics.dailyAverageCents < 0
                ? 'negative'
                : 'info'
            ].text
          }
        >
          {metrics.dailyAverageCents === null
            ? unavailable
            : formatMoney(metrics.dailyAverageCents)}
        </dd>
      </div>
      <div>
        <dt className="text-slate-500">Left this week</dt>
        <dd className={toneStyles[metrics.remainingCents === 0 ? 'positive' : 'warning'].text}>
          {metrics.remainingCents === null ? unavailable : formatMoney(metrics.remainingCents)}
        </dd>
      </div>
      {metrics.aboveTargetCents !== null && metrics.aboveTargetCents > 0 && (
        <div className="col-span-2">
          <dt className="inline text-slate-500">Above weekly target: </dt>
          <dd className={`inline ${toneStyles.positive.text}`}>
            {formatMoney(metrics.aboveTargetCents)}
          </dd>
        </div>
      )}
    </dl>
  )
}

export function WeeklyGoalSummary({ goals }: { goals: Goal[] }) {
  return weeklyTradingGoalGroups(goals, plannedTradingDays)
    .filter((g) => g.accountCount + g.excludedAccountCount > 1)
    .map((group) => (
      <section
        key={group.key}
        aria-label="Combined weekly trading goals"
        className="mb-3 rounded-lg border border-sky-300/20 bg-sky-300/[.04] p-3"
      >
        <h3 className="text-sm font-semibold">Combined · {group.accountCount} accounts</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          {group.startDate} – {group.endDate}
        </p>
        <p className="mt-2 text-sm tabular-nums">
          {group.actualCents === null
            ? group.notStarted
              ? 'Not started'
              : 'Incomplete data'
            : formatMoney(group.actualCents)}
          <span className="text-xs text-slate-400">
            {' '}
            / {formatMoney(group.targetCents)} weekly target
          </span>
        </p>
        <WeeklyGoalAmounts metrics={group} notStarted={group.notStarted} />
        <div
          role="progressbar"
          aria-label="Combined weekly goal progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={group.percent ?? undefined}
          aria-valuetext={
            group.percent === null
              ? group.notStarted
                ? 'Not started'
                : 'Incomplete data'
              : `${group.percent.toFixed(1)}% of combined weekly target`
          }
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.07]"
        >
          <div
            className={`h-full ${toneStyles[group.remainingCents === 0 ? 'positive' : 'info'].bar}`}
            style={{ width: `${group.percent ?? 0}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          {group.notStarted
            ? 'Starts ' + group.startDate
            : `${group.metCount} of ${group.accountCount} individual account targets met.`}{' '}
          Combined results can offset between accounts; individual targets remain separate.
        </p>
        {group.excludedAccountCount > 0 && (
          <p className={`mt-2 text-xs ${toneStyles.warning.text}`}>
            {group.excludedAccountCount} accounts with overlapping goals excluded to prevent double
            counting.
          </p>
        )}
      </section>
    ))
}
