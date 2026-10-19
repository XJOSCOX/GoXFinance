import { expect, it } from 'vitest'
import type { Goal } from './goals'
import { weeklyGoalMetrics, weeklyTradingGoalGroups } from './goal-weekly-summary'

function goal(id: string, actualCents: number | null = 0): Goal {
  return {
    id,
    householdId: 'home',
    tradingAccountId: id,
    copyGroupId: null,
    goalType: 'trading_profit',
    period: 'weekly',
    direction: 'at_least',
    status: 'active',
    targetCents: 125000,
    timezone: 'America/Chicago',
    sessionStart: '08:30',
    progress: {
      startDate: '2026-10-25',
      endDate: '2026-10-31',
      actualCents,
      notStarted: false,
      incomplete: false,
      met: actualCents !== null && actualCents >= 125000,
    },
  } as Goal
}
it('divides the weekly total by five planned days and allows weaker days to be offset', () => {
  const actual = [40000, 10000, -5000, 30000, 50000].reduce((a, b) => a + b, 0)
  expect(weeklyGoalMetrics(goal('a', actual), 5)).toMatchObject({
    dailyAverageCents: 25000,
    remainingCents: 0,
    aboveTargetCents: 0,
    percent: 100,
  })
  expect(weeklyGoalMetrics(goal('a', 50000), 5)).toMatchObject({
    dailyAverageCents: 10000,
    remainingCents: 75000,
  })
})
it('retains losses, rounds averages symmetrically, and reports excess beyond the target', () => {
  expect(weeklyGoalMetrics(goal('a', -10003), 5)).toMatchObject({
    dailyAverageCents: -2001,
    remainingCents: 135003,
    percent: 0,
  })
  expect(weeklyGoalMetrics(goal('a', 150003), 5)).toMatchObject({
    dailyAverageCents: 30001,
    remainingCents: 0,
    aboveTargetCents: 25003,
    percent: 100,
  })
  expect(() => weeklyGoalMetrics(goal('a'), 0)).toThrow()
})
it('does not invent actual results for future or incomplete periods', () => {
  for (const progress of [{ notStarted: true }, { incomplete: true }, { actualCents: null }]) {
    const record = goal('a')
    expect(
      weeklyGoalMetrics({ ...record, progress: { ...record.progress, ...progress } }, 5),
    ).toMatchObject({ dailyAverageCents: null, remainingCents: null, percent: null })
  }
})
it('combines three accounts exactly once while preserving individual achievement', () => {
  const rows = [goal('a', 200000), goal('b', 125000), goal('c', 50000)]
  const summary = weeklyTradingGoalGroups([...rows, rows[0]], 5)[0]
  expect(summary).toMatchObject({
    accountCount: 3,
    actualCents: 375000,
    targetCents: 375000,
    dailyAverageCents: 75000,
    remainingCents: 0,
    metCount: 2,
  })
})
it('excludes ambiguous overlapping account goals and unrelated goal types', () => {
  const duplicate = { ...goal('a'), id: 'other-goal' }
  const rows = [
    goal('a'),
    duplicate,
    goal('b', 10000),
    { ...goal('c'), goalType: 'savings' as const },
    { ...goal('d'), status: 'paused' as const },
  ]
  expect(weeklyTradingGoalGroups(rows, 5)[0]).toMatchObject({
    accountCount: 1,
    excludedAccountCount: 1,
    actualCents: 10000,
    targetCents: 125000,
  })
})
it('keeps mismatched periods and session clocks separate and marks incomplete combined results', () => {
  const changed = goal('c')
  changed.progress.startDate = '2026-11-01'
  const clock = { ...goal('d'), sessionStart: '18:00' }
  const missing = goal('b', null)
  const groups = weeklyTradingGoalGroups([goal('a', 20000), missing, changed, clock], 5)
  expect(groups).toHaveLength(3)
  expect(groups[0]).toMatchObject({
    accountCount: 2,
    actualCents: null,
    dailyAverageCents: null,
    remainingCents: null,
  })
})
