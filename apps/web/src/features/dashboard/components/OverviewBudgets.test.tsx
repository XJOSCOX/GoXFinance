// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { budgetCategoryRows, type BudgetReport, type FinancialCategory } from '@goxfinance/shared'
import { useBudgets } from '../../budgets/hooks/useBudgets'
import { OverviewBudgets } from './OverviewBudgets'
vi.mock('../../budgets/hooks/useBudgets', () => ({ useBudgets: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
const categories = [
  { id: 'food', name: 'Groceries', archived: false },
  { id: 'utility', name: 'Utilities', archived: false },
] as FinancialCategory[]
function report(): BudgetReport {
  const budget = {
    status: 'active',
    totalCents: 100000,
    limits: [
      { categoryId: 'food', amountCents: 60000 },
      { categoryId: 'utility', amountCents: 30000 },
    ],
  } as BudgetReport['budget']
  return {
    budget,
    categories,
    actualCents: 83000,
    remainingCents: 17000,
    overCents: 0,
    rows: budgetCategoryRows(budget, categories, [
      { categoryId: 'food', actualCents: 48000 },
      { categoryId: 'utility', actualCents: 35000 },
    ]),
  } as BudgetReport
}
function show(data: BudgetReport | null, error = '') {
  vi.mocked(useBudgets).mockReturnValue({ data, error, refresh: vi.fn() })
  render(
    <MemoryRouter>
      <OverviewBudgets home="test-home" month="2026-10" />
    </MemoryRouter>,
  )
}
it('keeps monthly allocation, category assignments and spending performance distinct', () => {
  show(report())
  const categoryDetails = screen.getByText('Category performance (2)').closest('details')!
  expect(categoryDetails.open).toBe(false)
  fireEvent.click(screen.getByText('Category performance (2)'))
  expect(categoryDetails.open).toBe(true)
  expect(screen.getByText('Monthly allocation').textContent).toContain('$1,000.00')
  expect(screen.getByText('Assigned to categories').textContent).toContain('$900.00')
  expect(screen.getByText('Unallocated').textContent).toContain('$100.00')
  expect(
    screen.getByRole('img', { name: /\$900.00 assigned of \$1,000.00; \$100.00 unallocated/ }),
  ).toBeTruthy()
  expect(screen.getByText('Actual purchase spending').textContent).toContain('$830.00')
  expect(screen.getByText('Monthly spending remaining').textContent).toContain('$170.00')
  expect(
    screen
      .getByRole('progressbar', { name: 'Groceries spending used' })
      .getAttribute('aria-valuenow'),
  ).toBe('80')
  expect(screen.getByText('$50.00 over')).toBeTruthy()
  expect(screen.getByText(/1 categories over budget/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'View budget' }).getAttribute('href')).toBe(
    '/households/test-home/budgets',
  )
})
it('handles zero allocations, no budget, loading and errors without inventing planned amounts', () => {
  const data = report()
  show({
    ...data,
    budget: { ...data.budget!, totalCents: 0, limits: [] },
    rows: [],
    actualCents: 0,
    remainingCents: 0,
  })
  expect(screen.getByText('0%')).toBeTruthy()
  cleanup()
  show({ ...data, budget: null, rows: [], remainingCents: null })
  expect(screen.getByText('Not set')).toBeTruthy()
  expect(screen.queryByRole('img')).toBeNull()
  cleanup()
  show(null)
  expect(screen.getByRole('status').textContent).toContain('Loading')
  cleanup()
  show(null, 'Unavailable')
  expect(screen.getByRole('alert').textContent).toContain('Unavailable')
})
it('keeps long category lists expandable and distinguishes over-allocation spending', () => {
  const data = report()
  show({
    ...data,
    actualCents: 120000,
    remainingCents: 0,
    overCents: 20000,
    rows: Array.from({ length: 6 }, (_, i) => ({
      ...data.rows[0],
      categoryId: String(i),
      name: `Category ${i}`,
      limitCents: 10000,
    })),
  })
  expect(screen.getByText('Category performance (6)')).toBeTruthy()
  expect(screen.getByText('Over monthly allocation').textContent).toContain('$200.00')
})
