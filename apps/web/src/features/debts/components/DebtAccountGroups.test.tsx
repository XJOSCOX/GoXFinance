// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createDebtSchema, type Debt } from '@goxfinance/shared'
import { groupDebts } from '../lib/debt-groups'
import { DebtAccountGroups } from './DebtAccountGroups'

afterEach(cleanup)

it('shows accessible section navigation, unknown balances, and each account once', () => {
  const debt: Debt = {
    ...createDebtSchema.parse({
      creditorName: 'Fictional collector',
      accountType: 'collection',
      memberAssignments: [
        { memberId: '00000000-0000-4000-8000-000000000001', responsibility: 'primary' },
      ],
    }),
    id: 'debt',
    householdId: 'home',
    createdByUserId: 'user',
    isArchived: false,
    createdAt: '',
    updatedAt: '',
  }
  render(
    <DebtAccountGroups
      groups={groupDebts([debt])}
      archived={false}
      renderAccount={(item) => <article key={item.id}>{item.creditorName}</article>}
    />,
  )
  const navigation = screen.getByRole('navigation', { name: 'Debt sections' })
  expect(
    within(navigation)
      .getByRole('link', { name: /Collections/ })
      .getAttribute('href'),
  ).toBe('#debts-collections')
  const collections = screen.getByRole('region', { name: 'Collections' })
  expect(collections.textContent).toContain('Unknown')
  expect(collections.textContent).toContain('1 unknown')
  const toggle = within(collections).getByRole('button', { name: /Collections/ })
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('article')).toBeNull()
  expect(within(collections).getByText('Unknown').closest('button')).toBe(toggle)
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  const current = screen.getByRole('region', { name: 'Current debts' })
  const currentToggle = within(current).getByRole('button')
  fireEvent.click(currentToggle)
  expect(currentToggle.getAttribute('aria-expanded')).toBe('true')
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(toggle)
  expect(screen.queryByRole('article')).toBeNull()
  expect(currentToggle.getAttribute('aria-expanded')).toBe('true')
  // The summary card also opens its destination section.
  fireEvent.click(within(navigation).getByRole('link', { name: /Collections/ }))
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getAllByText('Fictional collector')).toHaveLength(1)
  expect(screen.getByRole('region', { name: 'Current debts' }).textContent).toContain(
    'No matching current debts',
  )
})
