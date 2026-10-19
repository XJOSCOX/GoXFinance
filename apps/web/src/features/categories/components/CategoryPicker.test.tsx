// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { FinancialCategory } from '@goxfinance/shared'
import { NotificationProvider } from '../../../components/ui/Notifications'
import { CategoryPicker } from './CategoryPicker'
import { createCategory, listCategories } from '../api/categoryClient'

vi.mock('../api/categoryClient', () => ({
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
}))
const home = '00000000-0000-4000-8000-000000000001'
const category: FinancialCategory = {
  id: '00000000-0000-4000-8000-000000000002',
  householdId: home,
  name: 'Utilities',
  description: null,
  icon: null,
  archived: false,
  revision: 1,
  createdAt: '',
  updatedAt: '',
  usage: { bills: 0, billPeriods: 0, debts: 0, expenses: 0 },
}
beforeEach(() => {
  vi.mocked(listCategories).mockResolvedValue({
    categories: [
      category,
      {
        ...category,
        id: '00000000-0000-4000-8000-000000000003',
        name: 'Archived example',
        archived: true,
      },
    ],
    canManage: true,
  })
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

it('searches active categories and creates a shared category from the selection workflow', async () => {
  const change = vi.fn(),
    parentSubmit = vi.fn(),
    created = { ...category, id: '00000000-0000-4000-8000-000000000004', name: 'Custom example' }
  vi.mocked(createCategory).mockResolvedValue({ category: created })
  render(
    <NotificationProvider>
      <form onSubmit={parentSubmit}>
        <CategoryPicker home={home} optional onChange={change} />
      </form>
    </NotificationProvider>,
  )
  await screen.findByRole('option', { name: 'Utilities' })
  expect(screen.queryByRole('option', { name: /Archived/ })).toBeNull()
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: category.id } })
  expect(change).toHaveBeenCalledWith(category.id, 'Utilities')
  fireEvent.change(screen.getByLabelText('Search available categories'), {
    target: { value: 'missing' },
  })
  expect(screen.queryByRole('option', { name: 'Utilities' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add / manage categories' }))
  await screen.findByRole('button', { name: 'Add category' })
  fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
  fireEvent.change(screen.getByLabelText('Category name'), { target: { value: created.name } })
  fireEvent.click(screen.getByRole('button', { name: 'Save category' }))
  await waitFor(() => expect(change).toHaveBeenCalledWith(created.id, created.name))
  expect(screen.getByText('Category created')).toBeTruthy()
  expect(parentSubmit).not.toHaveBeenCalled()
})

it('preserves inputs and reports a failed save without showing success', async () => {
  vi.mocked(createCategory).mockRejectedValue(new Error('Unable to persist category'))
  render(
    <NotificationProvider>
      <CategoryPicker home={home} onChange={() => {}} />
    </NotificationProvider>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Add / manage categories' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Add category' }))
  fireEvent.change(screen.getByLabelText('Category name'), { target: { value: 'Keep this input' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save category' }))
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Unable to persist category',
  )
  expect((screen.getByLabelText('Category name') as HTMLInputElement).value).toBe('Keep this input')
  expect(screen.queryByText('Category created')).toBeNull()
})
