import { randomUUID } from 'node:crypto'
import type { TradingAccountInput, TradingPayoutInput, GoalInput } from '@goxfinance/shared'
export { setup } from '../../testing/financial-workspace'
export const accountInput = (
  member: string,
  nickname = 'Example account',
): TradingAccountInput => ({
  responsibleMemberId: member,
  provider: 'Topstep',
  nickname,
  maskedExternalId: null,
  stage: 'xfa',
  xfaPath: 'standard',
  tierCents: 5000000,
  reportedBalanceCents: null,
  maximumLossCents: 200000,
  dailyLossCents: 25000,
  activationDate: null,
  status: 'active',
  timezone: 'America/Chicago',
  sessionStart: '18:00',
  notes: null,
  ruleSnapshot: null,
})
export const payoutInput = (accountId: string): TradingPayoutInput => ({
  accountId,
  requestedCents: 100000,
  requestDate: '2026-10-10',
  status: 'requested',
  approvedCents: null,
  receivedCents: null,
  depositDate: null,
  reference: null,
  notes: null,
  receiptConfirmed: false,
  existingIncomeTransactionId: null,
})
export const goalInput = (member: string): GoalInput => ({
  timezone: 'America/Chicago',
  sessionStart: '18:00',
  name: 'Example personal goal',
  goalType: 'trading_profit',
  targetCents: 30000,
  period: 'monthly',
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  responsibleMemberId: member,
  tradingAccountId: null,
  copyGroupId: null,
  direction: 'at_least',
  status: 'active',
  notes: null,
})
export const create = <T>(values: T) => ({ idempotencyKey: randomUUID(), values })
export const edit = <T>(revision: number, values: T) => ({
  revision,
  reason: 'Fictional test correction',
  values,
})
