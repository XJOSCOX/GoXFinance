import { sumCents, paymentNetCents } from './outflows'
import { localBillDate } from './financial-dates'
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

export function calculateDebtPaymentOverview(
  debt: Debt,
  payments: DebtPayment[],
  history: DebtBalanceHistory[],
  today = localBillDate(),
): DebtPaymentOverview {
  const latest = [...history]
    .filter(
      (item) =>
        (item.source === 'creditor_statement' || item.source === 'reconciliation') &&
        item.effectiveDate <= today,
    )
    .sort(
      (a, b) =>
        b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt),
    )[0]
  const directDate = debt.balanceVerifiedAt?.slice(0, 10) ?? null
  const useDirect =
    directDate !== null && directDate <= today && (!latest || directDate > latest.effectiveDate)
  const lastVerifiedBalanceCents = useDirect
    ? debt.currentBalanceCents
    : (latest?.balanceCents ?? null)
  const verifiedBalanceDate = useDirect ? directDate : (latest?.effectiveDate ?? null)
  const completed = payments.filter(
    (item) => item.paymentStatus === 'completed' && item.paymentDate <= today,
  )
  const afterVerification = verifiedBalanceDate
    ? completed.filter((item) => item.paymentDate > verifiedBalanceDate)
    : []
  const returnedAfterVerification = completed.some((p) =>
    (p.refunds ?? []).some(
      (r) =>
        r.status === 'completed' &&
        r.date <= today &&
        (!verifiedBalanceDate || r.date > verifiedBalanceDate),
    ),
  )
  const unknownPrincipalCount =
    afterVerification.filter((item) => item.principalAmountCents === null).length +
    (returnedAfterVerification ? 1 : 0)
  const ambiguousSameDayCount = verifiedBalanceDate
    ? completed.filter((item) => item.paymentDate === verifiedBalanceDate).length
    : 0
  const principalSinceVerificationCents = sumCents(
    afterVerification.map((item) => item.principalAmountCents ?? 0),
  )
  return {
    lastVerifiedBalanceCents,
    verifiedBalanceDate,
    completedPaymentTotalCents: sumCents(completed.map((item) => paymentNetCents(item, today))),
    principalReductionTotalCents: sumCents(completed.map((item) => item.principalAmountCents ?? 0)),
    paymentsSinceVerificationCents: sumCents(afterVerification.map((item) => item.amountCents)),
    principalSinceVerificationCents,
    unknownPrincipalCount,
    ambiguousSameDayCount,
    estimatedOutstandingCents:
      lastVerifiedBalanceCents === null ||
      !verifiedBalanceDate ||
      unknownPrincipalCount > 0 ||
      ambiguousSameDayCount > 0 ||
      principalSinceVerificationCents > lastVerifiedBalanceCents
        ? null
        : Math.max(0, lastVerifiedBalanceCents - principalSinceVerificationCents),
  }
}
