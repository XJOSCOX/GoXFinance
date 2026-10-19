// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
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
  const collections = screen.getByRole('region', { name: 'Collections 1' })
  expect(collections.textContent).toContain('Unknown')
  expect(collections.textContent).toContain('1 unknown')
  expect(screen.getAllByText('Fictional collector')).toHaveLength(1)
  expect(screen.getByRole('region', { name: 'Current debts 0' }).textContent).toContain(
    'No matching current debts',
  )
})
