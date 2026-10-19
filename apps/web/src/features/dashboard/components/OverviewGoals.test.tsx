// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Goal } from '@goxfinance/shared'
import { useGoals } from '../../goals/hooks/useGoals'
import { OverviewGoals } from './OverviewGoals'

vi.mock('../../goals/hooks/useGoals', () => ({ useGoals: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
const goal = {
  id: 'goal',
  name: 'Example account weekly profit',
  status: 'active',
  period: 'weekly',
  direction: 'at_least',
  targetCents: 25000,
  progress: {
    startDate: '2026-10-25',
    endDate: '2026-10-31',
    notStarted: true,
    actualCents: null,
    incomplete: true,
    met: null,
  },
} as Goal
function show(goals: Goal[] = [goal]) {
  vi.mocked(useGoals).mockReturnValue({
    data: { goals, contributions: [], canCreate: true },
    error: '',
    refresh: vi.fn(),
  })
  render(
    <MemoryRouter>
      <OverviewGoals home="test-household" />
    </MemoryRouter>,
  )
}
it('shows saved future targets without treating them as missing progress or income', () => {
  show()
  expect(useGoals).toHaveBeenCalledWith('test-household')
  expect(screen.getByText('Target $250.00')).toBeTruthy()
  expect(screen.getByText('Not started')).toBeTruthy()
  expect(screen.getByText('Starts 2026-10-25')).toBeTruthy()
  expect(screen.queryByText(/Unknown/)).toBeNull()
  expect(screen.getByRole('link', { name: 'View goals' }).getAttribute('href')).toBe(
    '/households/test-household/goals',
  )
})
it('uses recorded results for progress, including losses, and excludes inactive goals', () => {
  show([
    {
      ...goal,
      progress: {
        ...goal.progress,
        notStarted: false,
        actualCents: -5000,
        incomplete: false,
        met: false,
      },
    },
    { ...goal, id: 'paused', name: 'Paused goal', status: 'paused' },
  ])
  expect(screen.getByText('-$50.00 recorded')).toBeTruthy()
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
  expect(screen.queryByText('Paused goal')).toBeNull()
})
it('shows completed targets and exact progress from confirmed source calculations', () => {
  show([
    {
      ...goal,
      progress: {
        ...goal.progress,
        notStarted: false,
        actualCents: 25000,
        incomplete: false,
        met: true,
      },
    },
  ])
  expect(screen.getByText('Target met')).toBeTruthy()
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
})
it('handles empty, loading and failed goal requests without displaying fake totals', () => {
  show([])
  expect(screen.getByText('No active goals yet.')).toBeTruthy()
  cleanup()
  vi.mocked(useGoals).mockReturnValue({ data: null, error: '', refresh: vi.fn() })
  render(
    <MemoryRouter>
      <OverviewGoals home="test-household" />
    </MemoryRouter>,
  )
  expect(screen.getByRole('status').textContent).toContain('Loading goals')
  cleanup()
  vi.mocked(useGoals).mockReturnValue({ data: null, error: 'Unavailable', refresh: vi.fn() })
  render(
    <MemoryRouter>
      <OverviewGoals home="test-household" />
    </MemoryRouter>,
  )
  expect(screen.getByRole('alert').textContent).toContain('Unavailable')
  expect(screen.queryByText('Target $250.00')).toBeNull()
})

it('displays actual daily averages, remaining weekly amounts, and combined progress for three accounts', () => {
  const rows = [200000, 125000, -50000].map((actualCents, index) => ({
    ...goal,
    id: `goal-${index}`,
    tradingAccountId: `account-${index}`,
    name: `Account ${index + 1}`,
    goalType: 'trading_profit' as const,
    targetCents: 125000,
    progress: {
      ...goal.progress,
      notStarted: false,
      incomplete: false,
      actualCents,
      met: actualCents >= 125000,
    },
  }))
  show(rows)
  const combined = within(screen.getByRole('region', { name: 'Combined weekly trading goals' }))
  expect(combined.getByText('Combined · 3 accounts')).toBeTruthy()
  expect(combined.getByText('$550.00')).toBeTruthy()
  expect(combined.getByText('$1,000.00')).toBeTruthy()
  expect(combined.getByText(/2 of 3 individual account targets met/)).toBeTruthy()
  expect(Number(combined.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeCloseTo(
    73.3333,
  )
  expect(screen.getByText('-$100.00')).toBeTruthy()
  expect(screen.getByText('$1,750.00')).toBeTruthy()
  expect(screen.getByText('$750.00')).toBeTruthy() // First account's profit above its target.
})

it('shows planned combined targets before the start without inventing averages', () => {
  show(
    [0, 1, 2].map((index) => ({
      ...goal,
      id: `goal-${index}`,
      tradingAccountId: `account-${index}`,
      goalType: 'trading_profit' as const,
      targetCents: 125000,
    })),
  )
  const combined = within(screen.getByRole('region', { name: 'Combined weekly trading goals' }))
  expect(combined.getByText(/\$3,750.00 weekly target/)).toBeTruthy()
  expect(combined.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull()
  expect(combined.getAllByText('Not started')).toHaveLength(3)
  expect(combined.queryByText('$0.00')).toBeNull()
})
