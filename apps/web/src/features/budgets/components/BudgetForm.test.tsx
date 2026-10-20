// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BudgetReport } from '@goxfinance/shared'
import { BudgetForm } from './BudgetForm'
import { BudgetCategoryList } from './BudgetCategoryList'
import { BudgetCopyForm } from './BudgetCopyForm'
afterEach(cleanup)
const category = '10000000-0000-4000-8000-000000000001',
  id = '20000000-0000-4000-8000-000000000001'
const data = {
  month: '2026-10',
  responsibleMemberId: null,
  members: [],
  categories: [{ id: category, name: 'Custom groceries', archived: false }],
  records: [],
} as unknown as BudgetReport
it('saves precise per-category amounts, preserves inputs on failure and rejects excess category limits', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Fictional write error'))
  render(<BudgetForm data={data} save={save} close={() => {}} />)
  fireEvent.change(screen.getByLabelText('Total monthly budget ($)'), { target: { value: '500' } })
  fireEvent.change(screen.getByLabelText('Add budget category'), { target: { value: category } })
  fireEvent.change(screen.getByLabelText('Custom groceries limit ($)'), {
    target: { value: '600' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('cannot exceed'))
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Custom groceries limit ($)'), {
    target: { value: '342.18' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Fictional write error'),
  )
  expect(save.mock.calls[0][0].values).toMatchObject({
    totalCents: 50000,
    limits: [{ categoryId: category, amountCents: 34218 }],
  })
  expect((screen.getByLabelText('Custom groceries limit ($)') as HTMLInputElement).value).toBe(
    '342.18',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Remove Custom groceries' }))
  expect(screen.queryByLabelText('Custom groceries limit ($)')).toBeNull()
})
it('copies a previous month with its exact revision without copying spending', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(
    <BudgetCopyForm
      data={{
        ...data,
        records: [
          { id, month: '2026-09', revision: 3, responsibleMemberId: null, status: 'active' },
        ] as never,
      }}
      save={save}
      close={() => {}}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Copy budget' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0].values).toEqual({
    sourceId: id,
    sourceRevision: 3,
    month: '2026-10',
  })
})
it('updates inline threshold alerts without generating notification duplicates', () => {
  const row = {
    categoryId: category,
    name: 'Groceries',
    archived: false,
    limitCents: 10000,
    actualCents: 8000,
    remainingCents: 2000,
    overCents: 0,
    percent: 80,
    status: 'Approaching Limit' as const,
  }
  const view = render(<BudgetCategoryList rows={[row]} />)
  expect(screen.getByText('Budget alerts · 1')).toBeTruthy()
  expect(screen.getByRole('progressbar', { name: 'Groceries budget used' })).toBeTruthy()
  view.rerender(<BudgetCategoryList rows={[row]} />)
  expect(screen.getAllByText('Budget alerts · 1')).toHaveLength(1)
  view.rerender(
    <BudgetCategoryList
      rows={[{ ...row, status: 'Within Budget', actualCents: 7000, percent: 70 }]}
    />,
  )
  expect(screen.queryByText('Budget alerts · 1')).toBeNull()
})
