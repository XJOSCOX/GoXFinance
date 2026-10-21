// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { InsightCard } from './InsightCard'
import { InsightPlanModal } from './InsightPlanModal'
import { financialInsights } from '@goxfinance/shared'
import {
  insightFixture,
  insightInput,
  insightCategory,
  insightExpense,
  insightBudget,
} from '../../../../../packages/shared/src/insights.fixture'
import { apiRequest } from '../../lib/api'
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn(), errorMessage: (e: Error) => e.message }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
function fixture() {
  const s = insightFixture(),
    c = insightCategory()
  s.categories = [c]
  s.expenses = [insightExpense(c.id, '2026-10-20', 2000)]
  s.budgets = [insightBudget(c.id, 10000)]
  return financialInsights(s, insightInput(), '2026-10-20T12:00:00Z')
}
it('keeps explanation compact, exposes dated records and retains feedback when a plan already exists', () => {
  const i = fixture().insights.find((i) => i.type === 'budget_review')!,
    feedback = vi.fn(),
    plan = vi.fn()
  render(
    <MemoryRouter>
      <InsightCard
        insight={i}
        home="fictional"
        canManage
        canPlan={false}
        busy={false}
        onFeedback={feedback}
        onPlan={plan}
      />
    </MemoryRouter>,
  )
  expect(
    (screen.getByText('Calculation & evidence').closest('details') as HTMLDetailsElement).open,
  ).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Useful' }))
  expect(feedback).toHaveBeenCalledWith(i, 'useful')
  expect(
    (screen.getByRole('button', { name: 'Create action plan' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByText('Calculation & evidence'))
  fireEvent.click(screen.getByText(/Source records/))
  expect(screen.getByText(i.refs[0].id)).toBeTruthy()
})
it('does not offer mutation controls for read-only members and labels unknown impact explicitly', () => {
  const i = fixture().insights.find((i) => i.type === 'budget_review')!
  render(
    <MemoryRouter>
      <InsightCard
        insight={i}
        home="fictional"
        canManage={false}
        busy={false}
        onFeedback={vi.fn()}
        onPlan={vi.fn()}
      />
    </MemoryRouter>,
  )
  expect(screen.queryByRole('button', { name: 'Create action plan' })).toBeNull()
  expect(screen.getByText('Unknown; no savings assumed')).toBeTruthy()
})
it('requires preview again when a reduction changes, preserves conditional impact and sends only metadata', async () => {
  const report = fixture(),
    i = report.insights.find((i) => i.type === 'budget_review')!,
    onSaved = vi.fn(),
    onClose = vi.fn()
  vi.mocked(apiRequest).mockResolvedValue({
    scenario: {
      baseline: { lowestCents: null, incomplete: true },
      proposed: { lowestCents: null, incomplete: true },
      improvementCents: null,
    },
  })
  render(
    <InsightPlanModal
      home="fictional"
      data={{ report, fingerprint: 'a'.repeat(64), canManage: true, plans: [] }}
      insight={i}
      onSaved={onSaved}
      onClose={onClose}
    />,
  )
  fireEvent.change(screen.getByLabelText('Optional spending reduction (USD)'), {
    target: { value: '10.00' },
  })
  expect((screen.getByRole('button', { name: 'Accept plan' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Preview scenario' }))
  expect(
    await screen.findByText('Incomplete forecast. No reliable cash impact can be claimed.'),
  ).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Optional spending reduction (USD)'), {
    target: { value: '11.00' },
  })
  expect((screen.getByRole('button', { name: 'Accept plan' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  expect(apiRequest).toHaveBeenCalledWith(
    'households/fictional/insights/preview',
    expect.objectContaining({ method: 'POST' }),
  )
  expect(onSaved).not.toHaveBeenCalled()
})

it('pins the reviewed source fingerprint while background data refreshes', async () => {
  const report = fixture(),
    i = report.insights.find((i) => i.type === 'budget_review')!,
    base = { report, fingerprint: 'a'.repeat(64), canManage: true, plans: [] }
  vi.mocked(apiRequest).mockResolvedValue({ scenario: null })
  const view = render(
    <InsightPlanModal
      home="fictional"
      data={base}
      insight={i}
      onSaved={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  view.rerender(
    <InsightPlanModal
      home="fictional"
      data={{ ...base, fingerprint: 'b'.repeat(64) }}
      insight={i}
      onSaved={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Accept plan' }))
  expect(JSON.parse(String(vi.mocked(apiRequest).mock.calls[0][1]?.body)).fingerprint).toBe(
    base.fingerprint,
  )
})
