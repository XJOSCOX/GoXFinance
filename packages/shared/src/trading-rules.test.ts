import { it, expect } from 'vitest'
import { payoutSplitEstimate, ruleForPayout } from './trading-rules'
import { tradingRuleSchema } from './trading'

const legacy = {
  label: 'Example rule',
  effectiveDate: '2026-01-01',
  minimumDays: null,
  minimumNetCents: null,
  maximumPayoutCents: null,
  profitShareBps: 9000,
  notes: null,
}
it('calculates editable shares precisely, preserves cents and handles missing or invalid data', () => {
  expect(payoutSplitEstimate(100000, 9000)).toEqual({ traderCents: 90000, providerCents: 10000 })
  expect(payoutSplitEstimate(101, 9000)).toEqual({ traderCents: 91, providerCents: 10 })
  expect(payoutSplitEstimate(100000, 7500)?.traderCents).toBe(75000)
  expect(payoutSplitEstimate(Number.MAX_SAFE_INTEGER, 9000)?.traderCents).toBe(
    Number((BigInt(Number.MAX_SAFE_INTEGER) * 9000n + 5000n) / 10000n),
  )
  expect(payoutSplitEstimate(0, 0)).toEqual({ traderCents: 0, providerCents: 0 })
  expect(payoutSplitEstimate(100, 10000)).toEqual({ traderCents: 100, providerCents: 0 })
  for (const amount of [null, -1, 1.5, Number.NaN])
    expect(payoutSplitEstimate(amount, 9000)).toBeNull()
  for (const share of [null, -1, 10001, 90.1]) expect(payoutSplitEstimate(100, share)).toBeNull()
})
it('reads legacy snapshots and validates new optional plan fields without adding defaults', () => {
  expect(tradingRuleSchema.parse(legacy)).toEqual(legacy)
  expect(
    tradingRuleSchema.parse({ ...legacy, activationFeeCents: 0, resetCreditOnRebill: false }),
  ).toMatchObject({ activationFeeCents: 0, resetCreditOnRebill: false })
  expect(tradingRuleSchema.safeParse({ ...legacy, payoutConsistencyBps: 10001 }).success).toBe(
    false,
  )
})
it('uses date-effective snapshots and never applies later snapshots retroactively to existing payouts', () => {
  const rules = [
    { ...legacy, id: 'old', createdAt: '2026-01-01T00:00:00Z' },
    { ...legacy, id: 'new', profitShareBps: 8000, createdAt: '2026-02-01T00:00:00Z' },
  ]
  expect(ruleForPayout(rules, '2026-01-15', '2026-01-15T00:00:00Z')?.id).toBe('old')
  expect(ruleForPayout(rules, '2026-02-02')?.id).toBe('new')
  expect(ruleForPayout(rules, '2025-12-31')).toBeUndefined()
})
