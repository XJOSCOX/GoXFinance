// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Goal } from '@goxfinance/shared'
import { GoalCard } from './GoalCard'

afterEach(cleanup)
const goal = {
  name: 'Weekly profit',
  goalType: 'trading_profit',
  period: 'weekly',
  status: 'active',
  direction: 'at_least',
  targetCents: 25000,
  history: [],
  canManage: false,
  progress: {
    startDate: '2026-10-25',
    endDate: '2026-10-31',
    actualCents: null,
    shortfallCents: null,
    overageCents: null,
    met: null,
    incomplete: true,
    source: 'Recorded net realized P&L',
    notStarted: true,
  },
} as unknown as Goal
function show(record: Goal) {
  render(
    <GoalCard
      goal={record}
      contributions={[]}
      trading={null}
      onEdit={() => {}}
      onContribute={() => {}}
      onAudit={() => {}}
    />,
  )
}
it('labels future goals as not started without inventing progress or a shortfall', () => {
  show(goal)
  expect(screen.getByText('Not started')).toBeTruthy()
  expect(screen.getByText('Starts 2026-10-25')).toBeTruthy()
  expect(screen.queryByText(/Unknown|Incomplete source data|Shortfall:/)).toBeNull()
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull()
})
it('retains missing-data warnings for a goal that has already started', () => {
  show({ ...goal, progress: { ...goal.progress, notStarted: false } })
  expect(screen.getByText('Incomplete source data')).toBeTruthy()
  expect(screen.getByText('Unknown')).toBeTruthy()
  expect(screen.queryByText('Not started')).toBeNull()
})
