// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
