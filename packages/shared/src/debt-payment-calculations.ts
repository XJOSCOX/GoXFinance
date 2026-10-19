import type { Debt } from './debts'
import type { DebtBalanceHistory, DebtPayment } from './debt-payments'

export type DebtPaymentOverview = {
  lastVerifiedBalanceCents: number | null
  verifiedBalanceDate: string | null
  completedPaymentTotalCents: number
  principalReductionTotalCents: number
  paymentsSinceVerificationCents: number
  principalSinceVerificationCents: number
  unknownPrincipalCount: number
  ambiguousSameDayCount: number
  estimatedOutstandingCents: number | null
}

export function calculateDebtPaymentOverview(debt: Debt, payments: DebtPayment[], history: DebtBalanceHistory[]): DebtPaymentOverview {
  const latest = [...history].filter(item => item.source === 'creditor_statement' || item.source === 'reconciliation')
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt))[0]
  const directDate = debt.balanceVerifiedAt?.slice(0, 10) ?? null
  const useDirect = directDate !== null && (!latest || directDate > latest.effectiveDate)
  const lastVerifiedBalanceCents = useDirect ? debt.currentBalanceCents : latest?.balanceCents ?? null
  const verifiedBalanceDate = useDirect ? directDate : latest?.effectiveDate ?? null
  const completed = payments.filter(item => item.paymentStatus === 'completed')
  const afterVerification = verifiedBalanceDate ? completed.filter(item => item.paymentDate > verifiedBalanceDate) : []
  const unknownPrincipalCount = afterVerification.filter(item => item.principalAmountCents === null).length
  const ambiguousSameDayCount = verifiedBalanceDate ? completed.filter(item => item.paymentDate === verifiedBalanceDate).length : 0
  const principalSinceVerificationCents = afterVerification.reduce((total, item) => total + (item.principalAmountCents ?? 0), 0)
  return {
    lastVerifiedBalanceCents,
    verifiedBalanceDate,
    completedPaymentTotalCents: completed.reduce((total, item) => total + item.amountCents, 0),
    principalReductionTotalCents: completed.reduce((total, item) => total + (item.principalAmountCents ?? 0), 0),
    paymentsSinceVerificationCents: afterVerification.reduce((total, item) => total + item.amountCents, 0),
    principalSinceVerificationCents,
    unknownPrincipalCount,
    ambiguousSameDayCount,
    estimatedOutstandingCents: lastVerifiedBalanceCents === null || !verifiedBalanceDate || unknownPrincipalCount > 0 || ambiguousSameDayCount > 0 || principalSinceVerificationCents > lastVerifiedBalanceCents
      ? null : Math.max(0, lastVerifiedBalanceCents - principalSinceVerificationCents),
  }
}
