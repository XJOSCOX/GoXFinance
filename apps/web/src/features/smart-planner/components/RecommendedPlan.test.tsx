// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { smartPlanner } from '@goxfinance/shared'
import { plannerFixture } from '../../../../../../packages/shared/src/planner.fixture'
import { RecommendedPlan } from './RecommendedPlan'
afterEach(cleanup)
it('shows conditional funding, per-item reasons and an editable allocation without pretending to pay', () => {
  const { sources, input } = plannerFixture(),
    report = smartPlanner(sources, input, '2026-10-20'),
    allocate = vi.fn()
  render(<RecommendedPlan report={report} manage allocate={allocate} />)
  expect(screen.getByText('Recommended plan')).toBeTruthy()
  expect(screen.getAllByText(/Awaiting forecast paycheck/).length).toBeGreaterThan(0)
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Accept / adjust allocation', hidden: true })[0],
  )
  expect(allocate).toHaveBeenCalledWith(
    expect.objectContaining({
      purpose: 'obligation',
      status: 'accepted',
      target: expect.any(Object),
    }),
  )
  expect(screen.queryByText('Payment completed')).toBeNull()
})
it('read-only members can inspect recommendations without management controls', () => {
  const { sources, input } = plannerFixture()
  render(
    <RecommendedPlan
      report={smartPlanner(sources, input, '2026-10-20')}
      manage={false}
      allocate={vi.fn()}
    />,
  )
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getAllByText(/reserved/).length).toBeGreaterThan(0)
})
