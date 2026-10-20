// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TradingData } from '@goxfinance/shared'
import { TradingPerformance } from './TradingPerformance'
afterEach(cleanup)
it('keeps mixed copy-group results within the selected account stage', () => {
  const result = {
    id: 'c',
    accountId: 'c',
    sessionDate: '2026-10-01',
    grossCents: 10000,
    feesCents: 0,
    netCents: 10000,
    copyEventId: 'event',
  }
  render(
    <TradingPerformance
      data={
        {
          accounts: [
            { id: 'c', nickname: 'Evaluation', stage: 'combine' },
            { id: 'f', nickname: 'Funded', stage: 'xfa' },
          ],
          results: [
            result,
            result,
            { ...result, id: 'f', accountId: 'f', grossCents: -5000, netCents: -5000 },
          ],
          events: [{ id: 'event', groupId: 'g' }],
          groups: [{ id: 'g', name: 'Mixed group' }],
        } as unknown as TradingData
      }
    />,
  )
  fireEvent.change(screen.getByLabelText('Copy group'), { target: { value: 'g' } })
  expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0)
  expect(screen.queryByText('-$50.00')).toBeNull()
  fireEvent.click(screen.getByLabelText('Evaluation'))
  expect(screen.getByText('No recorded results for these accounts.')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Account stage'), { target: { value: 'funded' } })
  expect(screen.getAllByText('-$50.00').length).toBeGreaterThan(0)
  expect(screen.queryByText('$100.00')).toBeNull()
  expect(screen.queryByLabelText('Evaluation')).toBeNull()
})
