// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { NetWorthReport } from '@goxfinance/shared'
import { NetWorthSummary } from './NetWorthSummary'
afterEach(cleanup)
it('labels incomplete net worth and negative equity without treating unknowns as complete zeroes', () => {
  render(
    <NetWorthSummary
      report={
        {
          asOf: '2026-10-20',
          assetCents: 1000000,
          liabilityCents: 1200000,
          subtotalCents: -200000,
          incomplete: true,
          warnings: ['Missing valuation: example'],
          assetDistribution: [],
          liabilityDistribution: [],
        } as unknown as NetWorthReport
      }
    />,
  )
  expect(screen.getByText('Known net-worth subtotal').parentElement?.textContent).toContain(
    '-$2,000.00',
  )
  expect(screen.getByText(/this subtotal is not complete net worth/)).toBeTruthy()
  expect(screen.getByText('Missing valuation: example')).toBeTruthy()
})
