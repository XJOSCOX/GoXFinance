import { expect, it } from 'vitest'
import type { TradingResult, TradingAccount } from './trading'
import { tradingOverviewTotals, tradingStageTotals } from './trading-overview'
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

it('separates simulated and funded totals, accounts, negative results, and duplicate IDs', () => {
  const accounts = [
    { id: 'a', nickname: 'Leader', stage: 'combine' },
    { id: 'b', nickname: 'Follower', stage: 'combine' },
    { id: 'c', nickname: 'XFA', stage: 'xfa' },
    { id: 'd', nickname: 'Live', stage: 'lfa' },
  ] as TradingAccount[]
  const rows = accounts.map((a, i) => ({
    ...row(a.id, i === 1 ? null : 10000, i === 1 ? null : 0, i === 1 ? -5000 : 10000),
    accountId: a.id,
  }))
  const report = tradingStageTotals(
    [...accounts, accounts[0]],
    [...rows, rows[0], { ...row('unknown', 10000, 0, 10000), accountId: 'missing' }],
  )
  expect(report.combine).toMatchObject({
    netCents: 4500,
    feesCents: 500,
    missingBreakdownCount: 1,
    resultCount: 2,
  })
  expect(report.combine.accounts.map((a) => a.netCents)).toEqual([9750, -5250])
  expect(report.funded).toMatchObject({ netCents: 19500, feesCents: 500, resultCount: 2 })
  expect(report.funded.accounts.map((a) => a.id)).toEqual(['c', 'd'])
  expect(report.unclassifiedCount).toBe(1)
})
it('uses reported month and never account tiers or balances for stage P&L', () => {
  const accounts = [
    {
      id: 'a',
      nickname: 'Combine',
      stage: 'combine',
      tierCents: 5000000,
      reportedBalanceCents: 5000000,
    },
  ] as TradingAccount[]
  const result = {
    ...row('result', null, null, 15000, '2026-09-30'),
    accountId: 'a',
    reportedDate: '2026-10-01',
  }
  expect(tradingStageTotals(accounts, [result], '2026-10').combine).toMatchObject({
    netCents: 14750,
    profitCents: null,
    lossCents: null,
  })
  expect(tradingStageTotals(accounts, [result], '2026-09').combine.netCents).toBe(0)
  expect(tradingStageTotals(accounts, []).combine.netCents).toBe(0)
  expect(tradingStageTotals(accounts, [result]).funded.accounts).toEqual([])
})
