import { it, expect } from 'vitest'
import { tradingPayoutProgress, combinedTradingProgress } from './trading-progress'
import { ruleForPayout, latestSavedRule } from './trading-rules'
import type { TradingAccount, TradingResult, TradingPayout } from './trading'

const now = '2026-10-19T21:00:00Z'
const rule = {
  id: 'rule',
  label: 'Example',
  effectiveDate: '2026-10-01',
  createdAt: '2026-10-01T00:00:00Z',
  minimumDays: 5,
  minimumWinningDayCents: 15000,
  minimumNetCents: null,
  maximumPayoutCents: 400000,
  profitShareBps: 9000,
  notes: null,
}
const account = {
  id: 'account',
  status: 'active',
  deletedAt: null,
  activationDate: null,
  timezone: 'America/Chicago',
  sessionStart: '18:00',
  ruleSnapshots: [rule],
} as TradingAccount
const result = (id: string, day: string, netCents: number) =>
  ({ id, accountId: account.id, sessionDate: day, netCents }) as TradingResult
it('keeps four qualifying days after a loss and needs only one more win, without a consecutive-day requirement', () => {
  const rows = [
    result('1', '2026-10-10', 15000),
    result('2', '2026-10-11', 18000),
    result('3', '2026-10-12', 17000),
    result('4', '2026-10-13', 15000),
    result('loss', '2026-10-14', -10000),
  ]
  expect(tradingPayoutProgress(account, rows, [], now)).toMatchObject({
    qualifyingDays: 4,
    targetMet: false,
    netCents: 55000,
  })
  expect(
    tradingPayoutProgress(account, [...rows, result('5', '2026-10-16', 15000)], [], now),
  ).toMatchObject({ qualifyingDays: 5, targetMet: true, netCents: 70000 })
})
it('counts distinct net winning sessions, including copied trades, without counting gross or duplicate rows', () => {
  const rows = [
    result('1', '2026-10-10', 10000),
    result('2', '2026-10-10', 5000),
    result('3', '2026-10-11', 14999),
    result('4', '2026-10-12', -1000),
    result('5', '2026-10-13', 0),
  ]
  rows.push(rows[0])
  const p = tradingPayoutProgress(account, rows, [], now)
  expect(p.qualifyingDays).toBe(1)
  expect(p.sessionCount).toBe(4)
  expect(p.netCents).toBe(28999)
  expect(p.estimate).toEqual({ traderCents: 26099, providerCents: 2900 })
  expect(p.targetMet).toBe(false)
})
it('uses an explicit progress window and excludes future sessions and unrelated accounts', () => {
  const a = { ...account, ruleSnapshots: [{ ...rule, progressStartDate: '2026-10-15' }] }
  const rows = [
    result('old', '2026-10-14', 15000),
    result('today', '2026-10-18', 15000),
    result('future', '2026-10-20', 15000),
    { ...result('foreign', '2026-10-18', 15000), accountId: 'other' },
  ]
  expect(tradingPayoutProgress(a, rows, [], now)).toMatchObject({
    qualifyingDays: 1,
    currentSessionIncluded: true,
    netCents: 15000,
  })
})
it('caps positive net profit after reserving requested, approved and received amounts, without inferring income', () => {
  const rows = [result('1', '2026-10-10', 1000000)]
  const payout = (
    id: string,
    status: string,
    requestedCents: number,
    approvedCents: number | null = null,
  ) =>
    ({
      id,
      accountId: account.id,
      status,
      requestedCents,
      approvedCents,
      requestDate: '2026-10-12',
    }) as TradingPayout
  const payouts = [
    payout('p1', 'requested', 100000),
    payout('p2', 'approved', 200000, 150000),
    payout('p3', 'paid', 50000),
    payout('p4', 'cancelled', 900000),
    payout('p5', 'rejected', 900000),
  ]
  payouts.push(payouts[0])
  expect(tradingPayoutProgress(account, rows, payouts, now)).toMatchObject({
    reservedCents: 300000,
    basisCents: 400000,
    estimate: { traderCents: 360000, providerCents: 40000 },
  })
  expect(
    tradingPayoutProgress(account, [result('loss', '2026-10-10', -100)], [], now).estimate
      ?.traderCents,
  ).toBe(0)
})
it('requires each account to reach its own day target and labels incomplete combined estimates', () => {
  const other = { ...account, id: 'other' },
    unknown = { ...account, id: 'unknown', ruleSnapshots: [] }
  const rows = Array.from({ length: 5 }, (_, i) => result(String(i), `2026-10-${10 + i}`, 15000))
  expect(
    combinedTradingProgress(
      [account, account, other, unknown, { ...account, id: 'hidden', deletedAt: now }],
      rows,
      [],
      now,
    ),
  ).toMatchObject({
    accountCount: 3,
    targetMetCount: 1,
    estimatedAccountCount: 2,
    estimatedTraderCents: 67500,
  })
  expect(tradingPayoutProgress(unknown, [], [], now)).toMatchObject({
    qualifyingDays: null,
    target: null,
    estimate: null,
  })
})
it('edits rule versions without changing past payout estimates, including corrected effective dates', () => {
  const replacement = {
    ...rule,
    id: 'replacement',
    supersedesRuleId: rule.id,
    profitShareBps: 8000,
    effectiveDate: '2026-09-01',
    createdAt: '2026-10-19T20:00:00Z',
  }
  expect(ruleForPayout([rule, replacement], '2026-10-19')?.id).toBe('replacement')
  expect(latestSavedRule([{ ...replacement, createdAt: rule.createdAt }, rule])?.id).toBe(
    'replacement',
  )
  expect(ruleForPayout([rule, replacement], '2026-10-10', '2026-10-10T20:00:00Z')?.id).toBe('rule')
  expect(
    ruleForPayout([rule, { ...replacement, effectiveDate: '2026-11-01' }], '2026-10-19')?.id,
  ).toBe('rule')
})
