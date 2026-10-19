// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { calculateDebtSummary, type HouseholdOverview } from '@goxfinance/shared'
import { OverviewContent } from './OverviewContent'

afterEach(cleanup)

function overview(): HouseholdOverview {
  const payment = {
    id: 'completed',
    name: 'Cleared example',
    source: 'debt' as const,
    date: '2026-10-01',
    amountCents: 5000,
    status: 'completed' as const,
  }
  return {
    month: '2026-10',
    income: { confirmedCents: 10000, netRecordedCashFlowCents: 5000 },
    debts: { debts: [], summary: calculateDebtSummary([]) },
    bills: {
      standaloneMonthlyCents: 0,
      debtAndLinkedMonthlyCents: 0,
      householdMonthlyObligationsCents: 0,
      unknownRecurringCount: 0,
      estimatedRecurringCount: 0,
      overdueCount: 0,
      outstandingCents: 0,
    },
    actual: { spendingCents: 0, cashOutflowCents: 5000, transactionCount: 1 },
    payments: {
      billProgress: {
        billedCents: 0,
        paidCents: 0,
        creditCents: 0,
        remainingCents: 0,
        totalCount: 0,
        settledCount: 0,
        unknownCount: 0,
        percent: null,
      },
      futureCompletedCount: 0,
      completed: { items: [payment], totalCents: 5000 },
      pending: {
        items: [
          {
            ...payment,
            id: 'pending',
            name: 'Pending example',
            status: 'pending',
            amountCents: 9900,
          },
        ],
        totalCents: 9900,
      },
      scheduled: {
        items: [
          {
            ...payment,
            id: 'scheduled',
            name: 'Scheduled example',
            status: 'scheduled',
            amountCents: 1200,
          },
        ],
        totalCents: 1200,
      },
      remainingBills: { amountCents: 0, unknownCount: 0 },
    },
    upcoming: [],
    expenses: [],
    categories: [],
  }
}

function show(data = overview()) {
  render(
    <MemoryRouter>
      <OverviewContent data={data} home="example-home" />
    </MemoryRouter>,
  )
}

it('keeps confirmed cash flow separate from pending and scheduled activity', () => {
  show()
  const cash = screen.getByRole('region', { name: 'Monthly cash flow' })
  expect(cash.textContent).toContain('$100.00')
  expect(cash.textContent).toContain('$50.00')
  expect(cash.textContent).not.toContain('$99.00')
  expect(screen.getByText(/not your bank balance or available cash/)).toBeTruthy()
  expect(screen.getByText('Cleared example')).toBeTruthy()
  expect(screen.queryByText('Pending example')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^Pending/ }))
  expect(screen.getByText('Pending example')).toBeTruthy()
  expect(screen.queryByText('Cleared example')).toBeNull()
  expect(screen.getByText('Awaiting clearance; excluded from cash paid.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^Scheduled/ }))
  expect(screen.getByText('Scheduled example')).toBeTruthy()
})

it('shows actual partial balances, estimates, and unknown bill amounts distinctly', () => {
  const data = overview()
  const period: HouseholdOverview['upcoming'][number] = {
    id: 'actual',
    householdId: 'home',
    billId: 'bill',
    billName: 'Example utility',
    name: 'Example utility',
    category: 'Utilities',
    billingPeriod: '2026-10',
    dueDate: '2026-10-01',
    amountCents: 34218,
    estimatedAmountCents: 30000,
    creditCents: 0,
    paidCents: 20000,
    remainingCents: 14218,
    overpaidCents: 0,
    amountIsEstimate: false,
    paymentStatus: 'partially_paid',
    overdue: true,
    linkedDebtId: null,
    notes: null,
    createdAt: '',
    updatedAt: '',
  }
  data.upcoming = [
    period,
    {
      ...period,
      id: 'estimate',
      billName: 'Estimated utility',
      amountCents: null,
      amountIsEstimate: true,
      paidCents: 0,
      remainingCents: 30000,
    },
    {
      ...period,
      id: 'unknown',
      billName: 'Unknown utility',
      amountCents: null,
      estimatedAmountCents: null,
      remainingCents: null,
      paidCents: 0,
    },
  ]
  show(data)
  expect(screen.getByText('$142.18')).toBeTruthy()
  expect(screen.getByText('$200.00 paid')).toBeTruthy()
  expect(screen.getByText('Estimated remaining')).toBeTruthy()
  expect(screen.getByText('Unknown')).toBeTruthy()
  expect(screen.getAllByText('Actual bill not confirmed')).toHaveLength(2)
})

it('has useful empty states and household-scoped actions without invented records', () => {
  const data = overview()
  data.payments.completed = { items: [], totalCents: 0 }
  show(data)
  expect(screen.getByText('No outstanding bills')).toBeTruthy()
  expect(screen.getByText('No debts recorded.')).toBeTruthy()
  expect(screen.getByText('No data warnings to review.')).toBeTruthy()
  expect(screen.getByText('No completed payments this month.')).toBeTruthy()
  const actions = screen.getByRole('navigation', { name: 'Manage household finances' })
  expect(within(actions).getByRole('link', { name: 'Record income' }).getAttribute('href')).toBe(
    '/households/example-home/income',
  )
})

it('shows real bill progress and leaves unconfirmed amounts incomplete', () => {
  const data = overview()
  data.payments.billProgress = {
    billedCents: 34218,
    paidCents: 20000,
    creditCents: 0,
    remainingCents: 14218,
    percent: 58,
    totalCount: 2,
    settledCount: 0,
    unknownCount: 1,
  }
  show(data)
  expect(
    screen.getByRole('progressbar', { name: 'Actual bills covered' }).getAttribute('aria-valuenow'),
  ).toBe('58')
  expect(screen.getByText(/1 amounts unconfirmed; progress is incomplete/)).toBeTruthy()
  expect(screen.getByText(/\$142.18 remaining on known bills/)).toBeTruthy()
})
