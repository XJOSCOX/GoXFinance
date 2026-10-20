import { expect, it } from 'vitest'
import type { TradingResult } from './trading'
import { tradingOverviewTotals } from './trading-overview'
const row = (
  id: string,
  profit: number | null,
  loss: number | null,
  gross: number,
  date = '2026-10-19',
) =>
  ({
    id,
    sessionDate: date,
    profitCents: profit,
    lossCents: loss,
    grossCents: gross,
    feesCents: 250,
    netCents: gross - 250,
  }) as TradingResult
it('combines three accounts, preserves losses and fees, deduplicates records and filters the month', () => {
  const a = row('a', 35000, 10000, 25000)
  expect(
    tradingOverviewTotals(
      [
        a,
        a,
        row('b', 0, 10000, -10000),
        row('c', 25000, 0, 25000),
        row('prior', 99999, 0, 99999, '2026-09-30'),
      ],
      '2026-10',
    ),
  ).toEqual({
    resultCount: 3,
    breakdownCount: 3,
    missingBreakdownCount: 0,
    profitCents: 60000,
    lossCents: 20000,
    feesCents: 750,
    netCents: 39250,
  })
})
it('does not invent a split for copied or historical gross-only results', () => {
  expect(tradingOverviewTotals([row('copy', null, null, -5000)], '2026-10')).toMatchObject({
    profitCents: null,
    lossCents: null,
    feesCents: 250,
    netCents: -5250,
    missingBreakdownCount: 1,
  })
  expect(
    tradingOverviewTotals(
      [row('known', 10000, 1000, 9000), row('copy', null, null, -5000)],
      '2026-10',
    ),
  ).toMatchObject({
    profitCents: 10000,
    lossCents: 1000,
    feesCents: 500,
    netCents: 3500,
    missingBreakdownCount: 1,
  })
})
it('shows zero for an empty reporting month', () => {
  expect(tradingOverviewTotals([], '2026-10')).toMatchObject({
    resultCount: 0,
    profitCents: 0,
    lossCents: 0,
    feesCents: 0,
    netCents: 0,
  })
})
