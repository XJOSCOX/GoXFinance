import { expect, it } from 'vitest'
import { simulatePayoff } from './payoff-calculations'
import {
  settlementProgress,
  settlementSchema,
  type PayoffScenarioInput,
  type SettlementInput,
} from './debt-planning'
import type { Debt } from './debts'
import type { DebtPayment } from './debt-payments'
const debt = {
  id: 'a',
  householdId: 'home',
  isArchived: false,
  currentBalanceCents: 10000,
  minimumPaymentCents: 10000,
  interestRateApr: '12',
  confidence: 'confirmed',
  creditorName: 'Example',
  memberAssignments: [],
} as unknown as Debt
const input: PayoffScenarioInput = {
  name: 'Example',
  startDate: '2026-01-15',
  strategy: 'minimums',
  extraCents: 0,
  availableCents: null,
  order: [],
  assumptions: [],
}
it('rounds monthly interest half-up and pays after interest, without mutating debt records', () => {
  const result = simulatePayoff([debt], input)
  expect(result).toMatchObject({
    complete: true,
    months: 2,
    interestCents: 101,
    payoffDate: '2026-03-01',
  })
  expect(result.timeline[0]).toMatchObject({
    interestCents: 100,
    paidCents: 10000,
    remainingCents: 100,
  })
  expect(debt.currentBalanceCents).toBe(10000)
  expect(
    simulatePayoff(
      [{ ...debt, currentBalanceCents: 50, minimumPaymentCents: 1, interestRateApr: '12' }],
      input,
    ).timeline[0].interestCents,
  ).toBe(1)
})
it('sorts snowball, avalanche, custom priorities and uses freed minimums plus extra', () => {
  const a = {
      ...debt,
      currentBalanceCents: 100000,
      minimumPaymentCents: 2000,
      interestRateApr: '5',
    },
    b = {
      ...debt,
      id: 'b',
      currentBalanceCents: 200000,
      minimumPaymentCents: 6000,
      interestRateApr: '25',
    }
  const snow = simulatePayoff([a, b], { ...input, strategy: 'snowball', extraCents: 5000 }),
    ava = simulatePayoff([a, b], { ...input, strategy: 'avalanche', extraCents: 5000 }),
    base = simulatePayoff([a, b], input)
  expect(snow.order[0].id).toBe('a')
  expect(ava.order[0].id).toBe('b')
  expect(ava.interestCents).toBeLessThan(snow.interestCents)
  expect(ava.months!).toBeLessThan(base.months!)
  expect(
    simulatePayoff([a, b], { ...input, strategy: 'custom', order: ['b', 'a'] }).order[0].id,
  ).toBe('b')
})
it('retains missing values, permits explicit assumptions, excludes archived and verified duplicates', () => {
  const unknown = { ...debt, interestRateApr: null, minimumPaymentCents: null }
  expect(simulatePayoff([unknown], input)).toMatchObject({
    complete: false,
    months: null,
    initialCents: 0,
  })
  expect(
    simulatePayoff([unknown], {
      ...input,
      assumptions: [{ debtId: 'a', apr: '0', minimumCents: 5000 }],
    }).months,
  ).toBe(2)
  expect(
    simulatePayoff(
      [
        debt,
        { ...debt, id: 'b', linkedOriginalDebtId: 'a', duplicateLinkVerified: true },
        { ...debt, id: 'c', isArchived: true },
      ],
      input,
    ).initialCents,
  ).toBe(10000)
  expect(simulatePayoff([{ ...debt, currentBalanceCents: null }], input).missing).toHaveLength(1)
  expect(simulatePayoff([{ ...debt, currentBalanceCents: 0 }], input).months).toBe(0)
})
it('reports non-amortizing and unaffordable scenarios without claiming debt freedom', () => {
  expect(simulatePayoff([{ ...debt, minimumPaymentCents: 1 }], input).complete).toBe(false)
  expect(
    simulatePayoff([debt], {
      ...input,
      strategy: 'snowball',
      extraCents: 1000,
      availableCents: 9000,
    }).shortfallCents,
  ).toBe(2000)
})
it('settlements use confirmed authoritative payments, distinguish overpayments and react to cancellations', () => {
  const offer = {
    debtId: 'a',
    originalBalanceCents: 50000,
    amountCents: 20000,
    schedule: [
      { id: '1', dueDate: '2026-01-01', amountCents: 10000, paymentId: 'p' },
      { id: '2', dueDate: '2026-02-01', amountCents: 10000, paymentId: null },
    ],
  } as SettlementInput
  const payment = {
    id: 'p',
    debtId: 'a',
    amountCents: 20000,
    paymentStatus: 'completed',
    paymentDate: '2026-01-01',
  } as DebtPayment
  expect(settlementProgress(offer, [payment], '2026-03-01')).toMatchObject({
    paidCents: 20000,
    remainingCents: 10000,
    overpaidCents: 10000,
    savingsCents: 30000,
    discountPercent: 60,
  })
  for (const paymentStatus of ['pending', 'scheduled', 'cancelled', 'failed'] as const)
    expect(settlementProgress(offer, [{ ...payment, paymentStatus }], '2026-03-01').paidCents).toBe(
      0,
    )
  expect(
    settlementProgress(offer, [{ ...payment, amountCents: 5000 }], '2026-03-01').remainingCents,
  ).toBe(15000)
  expect(settlementSchema.safeParse({ ...offer }).success).toBe(false)
})
