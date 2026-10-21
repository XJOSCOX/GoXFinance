// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { IncomeData, PayrollWeek } from '@goxfinance/shared'
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
it('shows a future forecast for an employer with no paycheck yet and keeps it out of received totals', () => {
  render(
    <IncomeOverview
      data={{ ...data, sources: [{ ...data.sources[0], status: 'active' }], transactions: [] }}
      members={[]}
      month="2026-10"
      today="2026-10-20"
      changeMonth={() => {}}
      weeks={[
        {
          id: 'draft',
          sourceId: 'job',
          stage: 'hours_draft',
          statement: null,
          statementReceivedAt: null,
          incomeTransactionId: null,
          workweekStart: '2026-11-11',
          workweekEnd: '2026-11-15',
          expectedPayDate: '2026-11-20',
          regularHundredths: 3857,
          regularMinutes: 2314,
          overtimeHundredths: 0,
          forecasts: [
            {
              modelVersion: 1,
              createdAt: '2026-10-20',
              result: {
                grossCents: 96417,
                netCents: null,
                workedHundredths: 3857,
                confidence: 'unknown',
              },
            },
          ],
        } as unknown as PayrollWeek,
      ]}
    />,
  )
  expect(screen.getByText('Next estimated paycheck')).toBeTruthy()
  expect(screen.getByText('Nov 20, 2026')).toBeTruthy()
  expect(screen.getByText('38h 34min')).toBeTruthy()
  expect(screen.getByText('$964.17')).toBeTruthy()
  expect(screen.getByText(/Take-home unknown until deductions/)).toBeTruthy()
  const totals = within(screen.getByRole('region', { name: 'Monthly income summary' }))
  expect(totals.getByText('$0.00')).toBeTruthy()
  expect(totals.queryByText('$964.17')).toBeNull()
})
it('shows recent paychecks without recorded-paycheck statistics and explains a different reporting month', () => {
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
  expect(screen.queryByText('Recorded paychecks')).toBeNull()
  expect(screen.queryByText('Add another confirmed paycheck to calculate an average.')).toBeNull()
  expect(screen.queryByText('Confirmed income averages')).toBeNull()
  expect(screen.queryByText('$84.70')).toBeNull()
  expect(screen.queryByText('$211.74')).toBeNull()
  expect(screen.queryByText('2026-09', { exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'View latest pay month' }))
  expect(changeMonth).toHaveBeenCalledWith('2026-09')
  expect(screen.queryByRole('button', { name: 'Monthly totals' })).toBeNull()
  expect(screen.getByText('Year to date')).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Monthly income summary' })).toBeTruthy()
  expect(screen.getByText('Recent paychecks')).toBeTruthy()
})
