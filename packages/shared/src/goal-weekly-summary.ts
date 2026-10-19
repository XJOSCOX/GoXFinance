import type { Goal } from './goals'
import { sumCents } from './outflows'

// This is a full-week pace: unrecorded days do not shrink the planned denominator.
export function weeklyGoalMetrics(goal: Goal, plannedDays: number) {
  if (!Number.isInteger(plannedDays) || plannedDays < 1 || plannedDays > 7)
    throw new Error('Planned days must be an integer from 1 to 7')
  const actual =
    goal.progress.notStarted || goal.progress.incomplete ? null : goal.progress.actualCents
  return totalMetrics(actual, goal.targetCents, plannedDays)
}

function totalMetrics(actual: number | null, target: number, plannedDays: number) {
  // Round the displayed daily average to the nearest cent, symmetrically for losses.
  const average =
    actual === null
      ? null
      : (() => {
          const cents = BigInt(Math.abs(actual)),
            days = BigInt(plannedDays)
          return Number((cents * 2n + days) / (days * 2n)) * (actual < 0 ? -1 : 1)
        })()
  return {
    actualCents: actual,
    targetCents: target,
    dailyAverageCents: average,
    remainingCents: actual === null ? null : Math.max(0, sumCents([target, -actual])),
    aboveTargetCents: actual === null ? null : Math.max(0, sumCents([actual, -target])),
    percent:
      actual === null
        ? null
        : target === 0
          ? actual >= 0
            ? 100
            : 0
          : Math.min(100, Math.max(0, (actual / target) * 100)),
  }
}

export function weeklyTradingGoalGroups(goals: Goal[], plannedDays: number) {
  const groups = new Map<string, Goal[]>()
  for (const goal of new Map(goals.map((goal) => [goal.id, goal])).values()) {
    if (
      goal.status !== 'active' ||
      goal.period !== 'weekly' ||
      goal.goalType !== 'trading_profit' ||
      goal.direction !== 'at_least' ||
      !goal.tradingAccountId ||
      goal.copyGroupId
    )
      continue
    const key = JSON.stringify([
      goal.householdId,
      goal.progress.startDate,
      goal.progress.endDate,
      goal.timezone,
      goal.sessionStart,
    ])
    groups.set(key, [...(groups.get(key) ?? []), goal])
  }
  return [...groups.entries()].map(([key, candidates]) => {
    const counts = new Map<string, number>()
    for (const goal of candidates)
      counts.set(goal.tradingAccountId!, (counts.get(goal.tradingAccountId!) ?? 0) + 1)
    // Two different goals for one account are ambiguous; neither is counted in a combined total.
    const included = candidates.filter((goal) => counts.get(goal.tradingAccountId!) === 1)
    const metrics = included.map((goal) => weeklyGoalMetrics(goal, plannedDays))
    const known = included.length > 0 && metrics.every((m) => m.actualCents !== null)
    return {
      key,
      startDate: candidates[0].progress.startDate,
      endDate: candidates[0].progress.endDate,
      accountCount: included.length,
      excludedAccountCount: [...counts.values()].filter((n) => n > 1).length,
      notStarted: included.length > 0 && included.every((g) => g.progress.notStarted),
      metCount: included.filter(
        (g) => !g.progress.notStarted && !g.progress.incomplete && g.progress.met === true,
      ).length,
      ...totalMetrics(
        known ? sumCents(metrics.map((m) => m.actualCents!)) : null,
        sumCents(included.map((g) => g.targetCents)),
        plannedDays,
      ),
    }
  })
}
