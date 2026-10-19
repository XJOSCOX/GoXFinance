import { expect, it } from 'vitest'
import { createDebtSchema, type Debt } from './debts'
import type { DebtBalanceHistory } from './debt-payments'
import { debtPayoffProgress } from './debt-payoff-progress'

const debt: Debt = {
  ...createDebtSchema.parse({
    creditorName: 'Example lender',
    accountType: 'credit_card',
    currentBalanceCents: 80000,
    memberAssignments: [
      { memberId: '00000000-0000-4000-8000-000000000001', responsibility: 'joint' },
      { memberId: '00000000-0000-4000-8000-000000000002', responsibility: 'joint' },
    ],
  }),
  id: 'debt',
  householdId: 'home',
  createdByUserId: 'user',
  isArchived: false,
  createdAt: '',
  updatedAt: '',
}
function entry(
  date: string,
  amount: number,
  changes: Partial<DebtBalanceHistory> = {},
): DebtBalanceHistory {
  return {
    id: date,
    householdId: 'home',
    debtId: 'debt',
    balanceCents: amount,
    effectiveDate: date,
    source: 'creditor_statement',
    recordedByUserId: 'user',
    notes: null,
    createdAt: `${date}T00:00:00.000Z`,
    ...changes,
  }
}
it('compares dated balances rather than subtracting payments or original loan amounts', () => {
  expect(
    debtPayoffProgress(
      [debt],
      [entry('2026-01-01', 100000), entry('2026-02-01', 80000)],
      '2026-10-01',
    ),
  ).toMatchObject({
    baselineCents: 100000,
    remainingCents: 80000,
    reductionCents: 20000,
    percent: 20,
    trackedCount: 1,
  })
})
it('reports balance increases without negative progress or false payoff', () => {
  expect(
    debtPayoffProgress([debt], [entry('2026-01-01', 100000), entry('2026-02-01', 110000)]),
  ).toMatchObject({ reductionCents: 0, increaseCents: 10000, percent: 0 })
  expect(
    debtPayoffProgress([debt], [entry('2026-01-01', 100000), entry('2026-02-01', 1)]),
  ).toMatchObject({ percent: 99 })
  expect(
    debtPayoffProgress([debt], [entry('2026-01-01', 100000), entry('2026-02-01', 0)]),
  ).toMatchObject({ percent: 100 })
})
it('requires distinct dates, applies same-date corrections, and ignores future or foreign history', () => {
  const history = [
    entry('2026-01-01', 100000),
    entry('2026-01-01', 90000, { id: 'correction', createdAt: '2026-01-02T00:00:00.000Z' }),
    entry('2030-01-01', 0),
    entry('2026-02-01', 0, { householdId: 'other' }),
  ]
  expect(debtPayoffProgress([debt], history, '2026-10-01')).toMatchObject({
    trackedCount: 0,
    missingHistoryCount: 1,
    percent: null,
  })
  expect(
    debtPayoffProgress([debt], [...history, entry('2026-02-01', 80000)], '2026-10-01')
      .baselineCents,
  ).toBe(90000)
})
it('counts joint and verified linked obligations once, without splicing histories', () => {
  const collection = {
    ...debt,
    id: 'collection',
    accountType: 'collection' as const,
    linkedOriginalDebtId: debt.id,
    duplicateLinkVerified: true,
    confidence: 'estimated' as const,
  }
  const history = [entry('2026-01-01', 100000), entry('2026-02-01', 80000)]
  expect(
    debtPayoffProgress([{ ...debt, confidence: 'confirmed' }, collection], history),
  ).toMatchObject({ trackedCount: 1, reductionCents: 20000 })
  expect(
    debtPayoffProgress([debt], [history[0], entry('2026-02-01', 0, { debtId: 'collection' })])
      .trackedCount,
  ).toBe(0)
  expect(debtPayoffProgress([{ ...debt, isArchived: true }], history).trackedCount).toBe(0)
})
it('labels unverified baselines and handles zero starting balances', () => {
  expect(
    debtPayoffProgress(
      [{ ...debt, confidence: 'confirmed' }],
      [entry('2026-01-01', 0, { source: 'initial' }), entry('2026-02-01', 100)],
    ),
  ).toMatchObject({ percent: null, increaseCents: 100, unverifiedCount: 1 })
  expect(debtPayoffProgress([], [])).toMatchObject({ percent: null, trackedCount: 0 })
})
