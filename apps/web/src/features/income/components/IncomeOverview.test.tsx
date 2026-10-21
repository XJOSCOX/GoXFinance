// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { IncomeData } from '@goxfinance/shared'
import { IncomeOverview } from './IncomeOverview'
afterEach(cleanup)
const data = {
  sources: [{ id: 'job', name: 'Fictional employer', frequency: 'weekly' }],
  transactions: [
    {
      id: 'check',
      sourceId: 'job',
      responsibleMemberId: 'person',
      frequencySnapshot: 'weekly',
      status: 'confirmed',
      actualNetCents: 42348,
      depositDate: '2026-09-24',
      payDate: '2026-09-24',
    },
  ],
  canCreate: true,
} as IncomeData
it('shows one weekly paycheck, no fabricated average, and explains a different reporting month', () => {
  const changeMonth = vi.fn()
  render(
    <IncomeOverview
      data={data}
      members={[]}
      month="2026-10"
      today="2026-10-20"
      changeMonth={changeMonth}
    />,
  )
  expect(screen.getByText('Recorded paychecks')).toBeTruthy()
  expect(screen.getByText('Add another confirmed paycheck to calculate an average.')).toBeTruthy()
  expect(screen.queryByText('Confirmed income averages')).toBeNull()
  expect(screen.queryByText('$84.70')).toBeNull()
  expect(screen.queryByText('$211.74')).toBeNull()
  expect(screen.queryByText('2026-09', { exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'View latest pay month' }))
  expect(changeMonth).toHaveBeenCalledWith('2026-09')
  expect(screen.queryByRole('button', { name: 'Monthly totals' })).toBeNull()
  expect(screen.getByText('Year to date')).toBeTruthy()
})
it('shows a per-paycheck average only after two recorded checks', () => {
  render(
    <IncomeOverview
      data={{
        ...data,
        transactions: [
          ...data.transactions,
          {
            ...data.transactions[0],
            id: 'second',
            actualNetCents: 60000,
            depositDate: '2026-10-15',
          },
        ],
      }}
      members={[]}
      month="2026-10"
      today="2026-10-20"
      changeMonth={() => {}}
    />,
  )
  expect(screen.getByText('Average net per paycheck')).toBeTruthy()
  expect(screen.getByText('$511.74')).toBeTruthy()
  expect(screen.queryByText('Add another confirmed paycheck to calculate an average.')).toBeNull()
})
