import { expect, it } from 'vitest'
import { tradingCalendar } from './trading-calendar'
import type { TradingResult } from './trading'
const row = (
  id: string,
  accountId: string,
  date: string,
  netCents: number,
  tradeCount: number | null = 1,
) => ({ id, accountId, sessionDate: date, netCents, tradeCount }) as TradingResult
it('sums selected accounts exactly once, preserves losses and distinguishes blank days from recorded zero', () => {
  const a = row('a', 'a', '2026-10-09', 10000)
  const results = [
    a,
    a,
    row('b', 'b', '2026-10-09', 5000),
    row('c', 'a', '2026-10-12', -3000),
    row('z', 'a', '2026-10-13', 0, null),
    row('outside', 'a', '2026-11-01', 99999),
  ]
  const all = tradingCalendar(results, ['a', 'b', 'a'], '2026-10')
  expect(all.netCents).toBe(12000)
  expect(all.weeks.reduce((n, w) => n + w.netCents, 0)).toBe(all.netCents)
  expect(all.recordedDays).toBe(3)
  const cells = all.weeks.flatMap((w) => w.cells)
  expect(cells.find((d) => d.date === '2026-10-13')?.result).toMatchObject({
    netCents: 0,
    missingTradeCounts: 1,
  })
  expect(cells.find((d) => d.date === '2026-10-14')?.result).toBeNull()
  expect(tradingCalendar(results, ['a'], '2026-10').netCents).toBe(7000)
})
it('preserves reported closing-day labels across month boundaries and aligns weeks Monday through Sunday', () => {
  const result = { ...row('reported', 'a', '2024-01-31', 1234), reportedDate: '2024-02-01' }
  const cal = tradingCalendar([result, row('leap', 'a', '2024-02-29', -100)], ['a'], '2024-02')
  expect(cal.weeks[0].cells[0].date).toBe('2024-01-29')
  expect(
    cal.weeks.flatMap((w) => w.cells).find((c) => c.date === '2024-02-01')?.result?.netCents,
  ).toBe(1234)
  expect(cal.netCents).toBe(1134)
  expect(tradingCalendar([result], ['a'], '2024-01').netCents).toBe(0)
  expect(tradingCalendar([], [], '2021-02').weeks).toHaveLength(4)
  expect(() => tradingCalendar([], [], '2026-13')).toThrow('Invalid reporting month')
})
