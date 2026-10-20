// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ForecastInput, ForecastSources } from '@goxfinance/shared'
import { ForecastForm } from './ForecastForm'
import { ForecastResults } from './ForecastResults'
import { forecast } from '@goxfinance/shared'
afterEach(cleanup)
const sources: ForecastSources = {
  bills: [],
  debts: [],
  payments: [],
  income: { sources: [], transactions: [], canCreate: true },
  expenses: [],
  categories: [],
  offers: [],
}
const input: ForecastInput = {
  name: 'Test projection',
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  startingCents: null,
  confidence: 'unverified',
  mode: 'expected',
  income: [],
  variableSpendingCents: 0,
  extraDebtCents: 0,
  includeSettlements: false,
  includeUncertainPayouts: false,
  oneTime: [],
}
it('requires explicit starting cash, applies date presets and keeps uncertain payouts off', () => {
  const update = vi.fn()
  render(<ForecastForm sources={sources} initial={input} update={update} />)
  expect(
    (screen.getByLabelText('Starting cash at start of as-of date ($)') as HTMLInputElement).value,
  ).toBe('')
  fireEvent.click(screen.getByRole('button', { name: '7 days' }))
  fireEvent.change(screen.getByLabelText('Starting cash at start of as-of date ($)'), {
    target: { value: '342.18' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Update forecast' }))
  expect(update.mock.calls[0][0]).toMatchObject({
    startingCents: 34218,
    endDate: '2026-11-07',
    includeUncertainPayouts: false,
  })
})
it('shows unknown projected cash and separate net change when no opening cash is supplied', () => {
  render(
    <ForecastResults
      report={forecast(sources, { ...input, variableSpendingCents: 10000 }, '2026-10-20')}
    />,
  )
  expect(screen.getByText('Projected ending cash').parentElement?.textContent).toContain('Unknown')
  expect(screen.getByText('Known projected net change')).toBeTruthy()
  expect(screen.getByText(/Starting cash or financial information is missing/)).toBeTruthy()
})
