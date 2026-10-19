import { describe, expect, it } from 'vitest'
import type { Debt } from './debts'
import type { DebtBalanceHistory, DebtPayment } from './debt-payments'
import { calculateDebtPaymentOverview } from './debt-payment-calculations'

const debt: Debt = {
  id: 'debt', householdId: 'home', createdByUserId: 'user', creditorName: 'Example', accountNickname: null,
  accountType: 'auto_loan', accountStatus: 'open', paymentStatus: 'current', originalBalanceCents: 50000,
  currentBalanceCents: 40000, pastDueAmountCents: null, creditLimitCents: null, interestRateApr: '8.2500',
  minimumPaymentCents: 5000, dueDay: null, nextDueDate: null, lastPaymentDate: null, openedDate: null,
  closedDate: null, chargedOffDate: null, collectionAgency: null, originalCreditor: null, linkedOriginalDebtId: null,
  duplicateLinkVerified: false, balanceVerifiedAt: null, confidence: 'confirmed', notes: null,
  memberAssignments: [{ memberId: 'member', responsibility: 'primary' }], isArchived: false, createdAt: '', updatedAt: '',
}
const verified: DebtBalanceHistory = { id: 'balance', householdId: 'home', debtId: 'debt', balanceCents: 40000,
  effectiveDate: '2026-09-01', source: 'creditor_statement', recordedByUserId: 'user', notes: null, createdAt: '2026-09-02T00:00:00Z' }
const payment = (changes: Partial<DebtPayment> = {}): DebtPayment => ({ id: 'payment', householdId: 'home', debtId: 'debt',
  createdByUserId: 'user', idempotencyKey: 'key', amountCents: 5000, paymentDate: '2026-09-10',
  paymentStatus: 'completed', paymentMethod: 'bank_transfer', principalAmountCents: 3500, interestAmountCents: 1500,
  feesAmountCents: null, referenceNumber: null, notes: null, createdAt: '', updatedAt: '', ...changes })

describe('payment-aware balance estimates', () => {
  it('subtracts known principal only after verification, even for interest-bearing loans', () => {
    const result = calculateDebtPaymentOverview(debt, [payment(), payment({ id: 'old', paymentDate: '2026-08-20', principalAmountCents: 5000,
      interestAmountCents: null })], [verified])
    expect(result.lastVerifiedBalanceCents).toBe(40000)
    expect(result.completedPaymentTotalCents).toBe(10000)
    expect(result.principalReductionTotalCents).toBe(8500)
    expect(result.principalSinceVerificationCents).toBe(3500)
    expect(result.estimatedOutstandingCents).toBe(36500)
  })
  it('never assumes an unknown principal amount, even on a zero-interest loan', () => {
    const result = calculateDebtPaymentOverview({ ...debt, interestRateApr: '0' },
      [payment({ principalAmountCents: null, interestAmountCents: null })], [verified])
    expect(result.unknownPrincipalCount).toBe(1)
    expect(result.estimatedOutstandingCents).toBeNull()
  })
  it('excludes scheduled and failed payments from actual totals and estimates', () => {
    const result = calculateDebtPaymentOverview(debt, [payment({ paymentStatus: 'scheduled' }),
      payment({ id: 'failed', paymentStatus: 'failed' })], [verified])
    expect(result.completedPaymentTotalCents).toBe(0)
    expect(result.estimatedOutstandingCents).toBe(40000)
  })
  it('uses the latest statement without deducting payments on or before its date', () => {
    const latest = { ...verified, id: 'latest', effectiveDate: '2026-09-10', balanceCents: 37000 }
    const result = calculateDebtPaymentOverview(debt, [payment()], [verified, latest])
    expect(result.lastVerifiedBalanceCents).toBe(37000)
    expect(result.estimatedOutstandingCents).toBe(37000)
  })
  it('keeps the estimate unknown when no verified baseline exists', () => {
    expect(calculateDebtPaymentOverview(debt, [payment()], []).estimatedOutstandingCents).toBeNull()
  })
})
