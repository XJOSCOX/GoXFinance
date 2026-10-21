import { expect, it } from 'vitest'
import type { Goal } from '@goxfinance/shared'
import { goalCategory, sortGoals } from './goal-display'
const record = (id: string, changes: Partial<Goal> = {}) =>
  ({
    id,
    name: id,
    goalType: 'trading_profit',
    direction: 'at_least',
    targetCents: 10000,
    progress: {
      endDate: '2026-11-15',
      actualCents: 2500,
      incomplete: false,
      notStarted: false,
      shortfallCents: 7500,
      overageCents: 0,
      met: false,
    },
    ...changes,
  }) as Goal
it('categorizes goals and sorts by due date without changing saved record order', () => {
  const a = record('a'),
    b = record('b', { goalType: 'savings', progress: { ...a.progress, endDate: '2026-10-25' } }),
    goals = [a, b]
  expect(goalCategory(a)).toBe('Trading')
  expect(goalCategory(b)).toBe('Savings')
  expect(sortGoals(goals, 'due').map((g) => g.id)).toEqual(['b', 'a'])
  expect(goals).toEqual([a, b])
})
it('keeps unknown and future progress last and handles zero targets and at-most limits', () => {
  const a = record('ordinary'),
    unknown = record('unknown', { progress: { ...a.progress, actualCents: null } }),
    future = record('future', { progress: { ...a.progress, notStarted: true } }),
    limit = record('limit', {
      direction: 'at_most',
      progress: { ...a.progress, actualCents: 1000 },
    }),
    zero = record('zero', {
      targetCents: 0,
      progress: { ...a.progress, actualCents: 0, met: true },
    })
  const sorted = sortGoals([unknown, a, future, limit, zero], 'progress')
  expect(sorted.slice(0, 3).map((g) => g.id)).toEqual(['zero', 'limit', 'ordinary'])
  expect(new Set(sorted.slice(3).map((g) => g.id))).toEqual(new Set(['unknown', 'future']))
})
