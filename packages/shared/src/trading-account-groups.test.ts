import { it, expect } from 'vitest'
import { groupMatchingTradingAccounts } from './trading-account-groups'
import type { TradingAccount, TradingResult, TradingPayout } from './trading'

const now = '2026-10-19T21:00:00Z'
const rule = {
  id: 'rule',
  createdAt: now,
  label: 'Example',
  effectiveDate: '2026-10-01',
  minimumDays: 5,
  minimumWinningDayCents: 15000,
  minimumNetCents: null,
  maximumPayoutCents: 400000,
  profitShareBps: 9000,
  notes: null,
}
const accounts = Array.from(
  { length: 3 },
  (_, i) =>
    ({
      id: String(i),
      nickname: `Account ${i}`,
      responsibleMemberId: 'member',
      stage: 'xfa',
      xfaPath: 'standard',
      status: 'active',
      deletedAt: null,
      canManage: true,
      timezone: 'America/Chicago',
      sessionStart: '08:30',
      ruleSnapshots: [{ ...rule, id: String(i) }],
      reportedBalanceCents: null,
    }) as TradingAccount,
)
it('groups matching accounts while preserving their identities and ignoring version metadata', () => {
  const same = {
    ...accounts[0],
    ruleSnapshots: [
      { ...rule, id: 'old' },
      { ...rule, id: 'new', supersedesRuleId: 'old', progressStartDate: null },
    ],
  }
  const groups = groupMatchingTradingAccounts([same, ...accounts.slice(1)], [], [], now)
  expect(groups).toHaveLength(1)
  expect(groups[0].map((a) => a.id)).toEqual(['0', '1', '2'])
})
it('separates different balances, rules, permissions and per-session results', () => {
  for (const change of [
    { reportedBalanceCents: 1 },
    { canManage: false },
    { responsibleMemberId: 'another' },
    { ruleSnapshots: [{ ...rule, profitShareBps: 8000 }] },
  ]) {
    expect(
      groupMatchingTradingAccounts(
        [{ ...accounts[0], ...change }, ...accounts.slice(1)],
        [],
        [],
        now,
      ),
    ).toHaveLength(2)
  }
  const result = {
    id: 'result',
    accountId: '0',
    sessionDate: '2026-10-18',
    netCents: 15000,
    grossCents: 15100,
    feesCents: 100,
  } as TradingResult
  expect(groupMatchingTradingAccounts(accounts, [result], [], now)).toHaveLength(2)
  const payout = {
    id: 'payout',
    accountId: '0',
    requestDate: '2026-10-18',
    status: 'requested',
    requestedCents: 10000,
  } as TradingPayout
  expect(groupMatchingTradingAccounts(accounts, [], [payout], now)).toHaveLength(2)
})
