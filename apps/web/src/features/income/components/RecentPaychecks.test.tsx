// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { IncomeTransaction } from '@goxfinance/shared'
import { RecentPaychecks } from './RecentPaychecks'
afterEach(cleanup)
it('limits recent paychecks to five and paginates older records', () => {
  const transactions = Array.from({ length: 7 }, (_, i) => ({
    id: String(i),
    sourceId: 'job',
    payDate: `2026-10-${String(10 + i).padStart(2, '0')}`,
    status: 'confirmed',
    actualNetCents: 10000 + i,
  })) as IncomeTransaction[]
  render(<RecentPaychecks transactions={transactions} sources={[]} view={() => {}} />)
  expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(5)
  expect(screen.getByText('1–5 of 7')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Previous' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByText('6–7 of 7')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(5)
})

it('opens an existing paycheck without confirming pending income and excludes cancelled records', () => {
  const pending = {
    id: 'pending',
    sourceId: 'job',
    payDate: '2026-10-23',
    status: 'pending',
    actualNetCents: 90000,
  } as IncomeTransaction
  const view = vi.fn()
  render(
    <RecentPaychecks
      sources={[]}
      transactions={[
        pending,
        {
          ...pending,
          id: 'cancelled',
          payDate: '2026-10-24',
          status: 'cancelled',
          actualNetCents: 100,
        },
      ]}
      view={view}
    />,
  )
  expect(screen.getByText('Not received')).toBeTruthy()
  expect(screen.queryByText('$1.00')).toBeNull()
  fireEvent.click(screen.getByRole('button'))
  expect(view).toHaveBeenCalledExactlyOnceWith(pending)
})
