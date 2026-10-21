// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { fictionalDebt } from '../../../../../../packages/shared/src/planner.fixture'
import { smartSources } from '../../../../../../packages/shared/src/smart-forecast.fixture'
import { DebtPlanFields } from './DebtPlanFields'
afterEach(cleanup)
it('prefills a reviewed balance without confirming it or treating it as a settlement', () => {
  const s = smartSources(),
    debt = fictionalDebt('Fictional collection')
  s.debts = [debt]
  render(<DebtPlanFields sources={s} />)
  fireEvent.change(screen.getByLabelText('Debt to plan'), { target: { value: 'debt:' + debt.id } })
  expect(
    (screen.getByLabelText('Total to pay during this goal (USD)') as HTMLInputElement).value,
  ).toBe('500.00')
  expect((screen.getByLabelText('Plan confirmation') as HTMLSelectElement).value).toBe('draft')
  expect(screen.getByText(/never changes that balance/)).toBeTruthy()
})
it('switches to existing monthly bills without reusing the full payoff amount', () => {
  const s = smartSources()
  s.debts = [fictionalDebt()]
  render(<DebtPlanFields sources={s} />)
  fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: 'linked_bill' } })
  expect(screen.queryByLabelText('Total to pay during this goal (USD)')).toBeNull()
  expect(screen.getByLabelText('Existing debt-linked bill')).toBeTruthy()
})
