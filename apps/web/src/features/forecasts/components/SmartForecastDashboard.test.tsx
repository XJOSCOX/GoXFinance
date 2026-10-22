// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ForecastData } from '@goxfinance/shared'
import {
  smartSources,
  smartInput,
} from '../../../../../../packages/shared/src/smart-forecast.fixture'
import { SmartForecastDashboard } from './SmartForecastDashboard'
import { OpeningCashForm } from './OpeningCashForm'
import { fictionalBill, fictionalDebt } from '../../../../../../packages/shared/src/planner.fixture'
const mocks = vi.hoisted(() => ({ api: vi.fn(), notify: vi.fn() }))
vi.mock('../../../lib/api', () => ({
  apiRequest: mocks.api,
  errorMessage: (e: Error) => e.message,
}))
vi.mock('../../../components/ui/useNotify', () => ({ useNotify: () => mocks.notify }))
vi.mock('../../../lib/useLocalToday', () => ({ useLocalToday: () => '2026-10-20' }))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
const data = (): ForecastData => ({
  sources: smartSources(),
  fingerprint: 'a'.repeat(64),
  canSave: true,
  settings: {
    id: '11111111-1111-4111-8111-111111111111',
    revision: 1,
    createdAt: '2026-10-20T10:00:00Z',
    opening: smartInput(30000).smart!.opening,
    bufferCents: 25000,
  },
  scenarios: [],
})
it('shows unpaid requirements without completed bills or unconfirmed debt balances', () => {
  const d = data(),
    paid = fictionalBill('Fictional paid rent', 194720, '2026-10-20')
  paid.payments = [
    {
      id: 'paid',
      periodId: paid.periods[0].id,
      amountCents: 194720,
      status: 'completed',
      paymentDate: '2026-10-20',
      method: 'cash',
      debtPaymentId: null,
    } as never,
  ]
  paid.periods[0].paidCents = 194720
  paid.periods[0].paymentStatus = 'paid'
  d.sources.planner = { records: [] }
  d.sources.bills = [paid, fictionalBill('Fictional utility', 30000, '2026-10-21')]
  d.sources.debts = [{ ...fictionalDebt(), pastDueAmountCents: 4417700 }]
  render(
    <MemoryRouter>
      <SmartForecastDashboard home="fictional" data={{ ...d, settings: null }} refresh={vi.fn()} />
    </MemoryRouter>,
  )
  expect(screen.getByText('Upcoming cash requirements').parentElement?.textContent).toContain(
    '$300.00',
  )
  expect(screen.getByText('Bills / debt payments').parentElement?.textContent).toContain('$300.00')
  expect(screen.getByText('Completed bill payment', { exact: false })).toBeTruthy()
})
it('shows missing cash without fabricating a balance, supports 90 days and hides Viewer mutation controls', () => {
  render(
    <MemoryRouter>
      <SmartForecastDashboard
        home="fictional"
        data={{ ...data(), settings: null, canSave: false }}
        refresh={vi.fn()}
      />
    </MemoryRouter>,
  )
  expect(screen.getByRole('status').textContent).toContain(
    'Opening cash balance required for a complete cash projection.',
  )
  expect(screen.queryByRole('button', { name: 'Confirm cash / buffer' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Save immutable snapshot' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '90 days' }))
  expect(
    (screen.getByRole('combobox', { name: 'Inspect day' }) as HTMLSelectElement).options,
  ).toHaveLength(90)
})
it('compares and resets a negative-cash simulation without sending financial mutations', () => {
  render(
    <MemoryRouter>
      <SmartForecastDashboard home="fictional" data={data()} refresh={vi.fn()} />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('What-if planner'))
  fireEvent.change(screen.getByLabelText('Scenario item name'), {
    target: { value: 'Fictional repair' },
  })
  fireEvent.change(screen.getByLabelText('Scenario item amount (USD)'), {
    target: { value: '800' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Apply simulation' }))
  expect(
    screen.getByRole('row', { name: /First potential shortfall None 2026-10-20.*500.00/ }),
  ).toBeTruthy()
  expect(mocks.api).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reset simulation' }))
  fireEvent.click(screen.getByText('What-if planner'))
  expect((screen.getByLabelText('Scenario item name') as HTMLInputElement).value).toBe('')
  expect(screen.getByRole('row', { name: 'First potential shortfall None None' })).toBeTruthy()
})
it('waits for persisted cash confirmation and retains inputs on failure', async () => {
  const saved = vi.fn(),
    close = vi.fn()
  mocks.api.mockRejectedValueOnce(new Error('Fictional database unavailable'))
  render(<OpeningCashForm home="fictional" data={data()} saved={saved} close={close} />)
  fireEvent.change(screen.getByLabelText('Available cash (USD)'), { target: { value: '456.78' } })
  fireEvent.change(screen.getByLabelText('Confirmation note'), {
    target: { value: 'Fictional cash check' },
  })
  fireEvent.click(
    screen.getByLabelText('I reviewed the cash amount, timing and selected accounts.'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cash & buffer' }))
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('database unavailable'),
  )
  expect((screen.getByLabelText('Available cash (USD)') as HTMLInputElement).value).toBe('456.78')
  expect(saved).not.toHaveBeenCalled()
  let finish: () => void = () => {}
  mocks.api.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cash & buffer' }))
  expect((screen.getByRole('button', { name: 'Confirming…' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  expect(saved).not.toHaveBeenCalled()
  finish()
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  const request = JSON.parse(mocks.api.mock.calls[1][1].body)
  expect(request.values.opening.amountCents).toBe(45678)
  expect(mocks.api.mock.calls[0][1].body).toBe(mocks.api.mock.calls[1][1].body)
})
