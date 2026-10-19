import { describe, expect, it } from 'vitest'
import { calculateDebtSummary } from './debt-calculations'
import type { Debt } from './debts'

const base: Debt = {
  id: 'one', householdId: 'home', createdByUserId: 'user', creditorName: 'Test creditor', accountNickname: null,
  accountType: 'credit_card', accountStatus: 'closed', paymentStatus: 'charged_off', originalBalanceCents: null,
  currentBalanceCents: 12000, pastDueAmountCents: 3000, creditLimitCents: null, interestRateApr: null,
  minimumPaymentCents: 500, dueDay: null, nextDueDate: null, lastPaymentDate: null, openedDate: null,
  closedDate: null, chargedOffDate: null, collectionAgency: null, originalCreditor: null,
  linkedOriginalDebtId: null, duplicateLinkVerified: false, balanceVerifiedAt: null, confidence: 'confirmed',
  notes: null, memberAssignments: [{ memberId: 'a', responsibility: 'joint' }, { memberId: 'b', responsibility: 'joint' }],
  isArchived: false, createdAt: '', updatedAt: '',
}

describe('debt totals', () => {
  it('counts a joint closed charged-off obligation once while showing shared member exposure', () => {
    const total = calculateDebtSummary([base])
    expect(total.confirmedBalanceCents).toBe(12000)
    expect(total.countedObligationCount).toBe(1)
    expect(total.balancesByPaymentStatus.charged_off).toBe(12000)
    expect(total.byMember).toEqual([
      { memberId: 'a', knownBalanceCents: 12000, unknownCount: 0, sharedCount: 1 },
      { memberId: 'b', knownBalanceCents: 12000, unknownCount: 0, sharedCount: 1 },
    ])
  })
  it('does not turn unknown balance into zero', () => {
    const total = calculateDebtSummary([{ ...base, currentBalanceCents: null }])
    expect(total.unknownBalanceCount).toBe(1)
    expect(total.confirmedBalanceCents).toBe(0)
  })
  it('only suppresses a linked collection after explicit verification', () => {
    const collection: Debt = { ...base, id: 'two', accountType: 'collection', accountStatus: 'transferred',
      paymentStatus: 'collection', currentBalanceCents: 11000, confidence: 'estimated', linkedOriginalDebtId: 'one' }
    const unverified = calculateDebtSummary([base, collection])
    expect(unverified.confirmedBalanceCents + unverified.estimatedBalanceCents).toBe(23000)
    const verified = calculateDebtSummary([base, { ...collection, duplicateLinkVerified: true }])
    expect(verified.confirmedBalanceCents + verified.estimatedBalanceCents).toBe(12000)
    expect(verified.countedObligationCount).toBe(1)
  })
})
