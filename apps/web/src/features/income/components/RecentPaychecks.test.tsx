// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { IncomeTransaction } from '@goxfinance/shared'
import { RecentPaychecks } from './RecentPaychecks'
afterEach(cleanup)
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
