import { expect, it } from 'vitest'
import { combineJournal } from './combine-journal'
import type { TradingAccount, TradingResult } from './trading'
const account = {
  id: 'a',
  stage: 'combine',
  tierCents: 5000000,
  maximumLossCents: 200000,
  activationDate: '2026-10-09',
  timezone: 'America/Chicago',
  sessionStart: '17:00',
} as TradingAccount
const result = (date: string, netCents: number, id = date) =>
  ({ id, accountId: 'a', sessionDate: date, netCents }) as TradingResult
const now = '2026-10-20T18:00:00Z'
it('trails end-of-day highs without dropping after losses and locks at the starting balance', () => {
  const rows = [
    result('2026-10-09', 50000),
    result('2026-10-10', -50000),
    result('2026-10-11', 250000),
    result('2026-10-12', -100000),
  ]
  const journal = combineJournal(account, rows, now)
  expect(journal.rows.map((r) => r.floorCents)).toEqual([4850000, 4850000, 5000000, 5000000])
  expect(journal).toMatchObject({
    balanceCents: 5150000,
    bufferCents: 150000,
    locked: true,
    recordedBreach: false,
  })
})
it('detects touching the prior floor and retains the breach after recovery, without changing provider status', () => {
  const journal = combineJournal(
    account,
    [result('2026-10-09', 200000), result('2026-10-10', -200000), result('2026-10-11', 300000)],
    now,
  )
  expect(journal.recordedBreach).toBe(true)
  expect(journal.rows[1].reachedFloor).toBe(true)
  expect(account.status).toBeUndefined()
})
it('aggregates copied results per session once and excludes foreign, future and pre-start results', () => {
  const a = result('2026-10-10', 20000)
  const journal = combineJournal(
    account,
    [
      a,
      a,
      result('2026-10-10', -5000, 'trade2'),
      result('2026-10-08', 999999),
      result('2026-10-21', 999999),
      { ...a, id: 'foreign', accountId: 'other' },
    ],
    now,
  )
  expect(journal.rows).toHaveLength(1)
  expect(journal.rows[0]).toMatchObject({
    netCents: 15000,
    balanceCents: 5015000,
    floorCents: 4815000,
  })
})
it('keeps current session provisional instead of ratcheting the floor intraday', () => {
  const journal = combineJournal(account, [result('2026-10-19', 250000)], now)
  expect(journal.rows[0]).toMatchObject({
    completed: false,
    floorCents: 4800000,
    balanceCents: 5250000,
  })
})
it('recalculates historical corrections and keeps a 30-day review separate from failure', () => {
  const original = combineJournal(account, [result('2026-10-10', 50000)], now)
  const edited = combineJournal(account, [result('2026-10-10', 10000)], '2026-11-08T18:00:00Z')
  expect(original.floorCents).toBe(4850000)
  expect(edited).toMatchObject({
    floorCents: 4810000,
    reviewDate: '2026-11-08',
    reviewDue: true,
    recordedBreach: false,
  })
})
it('preserves unknown start, tier and maximum loss without fabricating journal balances', () => {
  expect(
    combineJournal({ ...account, activationDate: null, tierCents: null }, [], now),
  ).toMatchObject({ rows: [], balanceCents: null, floorCents: null, reviewDate: null })
  expect(combineJournal({ ...account, maximumLossCents: null }, [], now).floorCents).toBeNull()
})

it('flags historical daily loss limits independently from the trailing floor and account status', () => {
  const journal = combineJournal(
    { ...account, dailyLossCents: 100000 },
    [result('2026-10-10', -100001)],
    now,
  )
  expect(journal.rows[0]).toMatchObject({ dailyLimitReached: true, reachedFloor: false })
  expect(journal.recordedBreach).toBe(false)
})
