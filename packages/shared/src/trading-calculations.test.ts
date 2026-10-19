import { expect, it } from 'vitest'
import {
  tradingSessionDate,
  tradingWeek,
  tradingPerformance,
  tradingRisk,
} from './trading-calculations'
import type { TradingResult, TradingAccount } from './trading'
it('groups session timestamps by selected timezone and boundary through daylight saving changes', () => {
  expect(tradingSessionDate('2026-10-10T22:59:00Z', 'America/Chicago', '18:00')).toBe('2026-10-09')
  expect(tradingSessionDate('2026-10-10T23:00:00Z', 'America/Chicago', '18:00')).toBe('2026-10-10')
  expect(tradingSessionDate('2026-01-10T00:00:00Z', 'America/Chicago', '18:00')).toBe('2026-01-09')
  expect(tradingSessionDate('2026-10-10T23:00:00Z', 'Asia/Tokyo', '18:00')).toBe('2026-10-10')
  expect(tradingWeek('2026-10-11')).toBe('2026-10-05')
})
it('aggregates selected accounts by day, week and month while preserving losses and zero days', () => {
  const results = [
    {
      accountId: 'a',
      sessionDate: '2026-10-10',
      grossCents: 10000,
      feesCents: 2000,
      netCents: 8000,
    },
    {
      accountId: 'b',
      sessionDate: '2026-10-10',
      grossCents: -10000,
      feesCents: 1000,
      netCents: -11000,
    },
    { accountId: 'a', sessionDate: '2026-10-11', grossCents: 0, feesCents: 0, netCents: 0 },
  ] as TradingResult[]
  expect(tradingPerformance(results, ['a', 'b'], 'day').map((r) => r.netCents)).toEqual([0, -3000])
  expect(tradingPerformance(results, ['a', 'b'], 'week')[0].netCents).toBe(-3000)
  expect(tradingPerformance(results, ['a'], 'month')[0].netCents).toBe(8000)
  const account = {
    id: 'b',
    timezone: 'America/Chicago',
    sessionStart: '18:00',
    dailyLossCents: 11000,
  } as TradingAccount
  expect(tradingRisk(account, results, '2026-10-10T23:30:00Z').dailyLimitReached).toBe(true)
  expect(
    tradingRisk({ ...account, dailyLossCents: null }, results, '2026-10-10T23:30:00Z')
      .dailyLimitReached,
  ).toBe(false)
})
