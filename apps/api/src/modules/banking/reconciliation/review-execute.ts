import { randomUUID } from 'node:crypto'
import {
  incomeTransactionSchema,
  type BankProposal,
  type BankReviewOptions,
  type PublicUser,
} from '@goxfinance/shared'
import type { ReviewServices } from './review-context'
import type { ReviewRepository } from './review.repository'
import type { bankRefundService } from './refund.service'
import { FinancialError } from '../../households/financial-access'
export type ReconciliationTarget = {
  expenseId?: string
  incomeId?: string
  billPaymentId?: string
  debtPaymentId?: string
  refundId?: string
  transferId?: string
}
export function reviewExecutor(
  services: ReviewServices,
  store: ReviewRepository,
  refunds: ReturnType<typeof bankRefundService>,
) {
  return (
    user: PublicUser,
    home: string,
    data: BankReviewOptions,
    p: BankProposal,
  ): ReconciliationTarget => {
    const t = data.transaction,
      amount = Math.abs(t.amountCents),
      method = data.account.type === 'credit_card' ? 'credit_card' : 'bank_transfer',
      notes = 'Explicitly confirmed from the bank transaction inbox'
    if (p.classification === 'ignore') return {}
    if (p.classification === 'expense' || p.classification === 'fee')
      return {
        expenseId:
          p.expenseId ??
          services.expenses.create(user, home, {
            idempotencyKey: randomUUID(),
            expense: p.expense!,
          }).id,
      }
    if (p.classification === 'debt_payment') {
      if (p.paymentId) return { debtPaymentId: p.paymentId }
      // Keep all unknown allocations null: a payment is not automatically principal reduction or final payoff.
      return {
        debtPaymentId: services.payments.create(user, home, p.debtId, {
          idempotencyKey: randomUUID(),
          amountCents: amount,
          paymentDate: t.date,
          paymentMethod: method,
          paymentStatus: 'completed',
          principalAmountCents: p.principalAmountCents,
          interestAmountCents: p.interestAmountCents,
          feesAmountCents: p.feesAmountCents,
          referenceNumber: null,
          notes,
        }).payment.id,
      }
    }
    if (p.classification === 'bill_payment') {
      const bill = data.bills.find((b) => b.id === p.billId)!
      let payment = bill.payments.find((v) => v.id === p.paymentId)
      if (!payment) {
        const key = randomUUID(),
          saved = services.bills.addPayment(user, home, bill.id, p.periodId, {
            idempotencyKey: key,
            amountCents: amount,
            paymentDate: t.date,
            method,
            status: 'completed',
            notes,
            principalAmountCents: p.principalAmountCents,
            interestAmountCents: p.interestAmountCents,
            feesAmountCents: p.feesAmountCents,
            referenceNumber: null,
            ...(p.billedAmountCents !== null
              ? {
                  billAmountConfirmation: {
                    amountCents: p.billedAmountCents,
                    expectedRevision: bill.revision,
                  },
                }
              : {}),
          })
        payment = saved.payments.find((v) => !bill.payments.some((old) => old.id === v.id))
      }
      if (!payment) throw new FinancialError('Payment persistence was not confirmed.', 500)
      return payment.debtPaymentId
        ? { debtPaymentId: payment.debtPaymentId }
        : { billPaymentId: payment.id }
    }
    if (p.classification === 'income') {
      const source = data.income.sources.find((s) => s.id === p.sourceId)!,
        old = data.income.transactions.find((v) => v.id === p.transactionId)
      if (old?.status === 'confirmed') return { incomeId: old.id }
      const values = incomeTransactionSchema.parse({
        sourceId: source.id,
        workPeriodStart: old?.workPeriodStart ?? null,
        workPeriodEnd: old?.workPeriodEnd ?? null,
        regularHours: old?.regularHours ?? null,
        overtimeHours: old?.overtimeHours ?? null,
        hourlyRateCents: old?.hourlyRateCents ?? source.hourlyRateCents,
        overtimeMultiplier: old?.overtimeMultiplier ?? source.overtimeMultiplier,
        expectedGrossCents: old?.expectedGrossCents ?? null,
        expectedNetCents: old?.expectedNetCents ?? null,
        actualGrossCents: p.actualGrossCents,
        deductionsCents: p.deductionsCents,
        actualNetCents: amount,
        payDate: old?.payDate ?? t.date,
        depositDate: t.date,
        status: 'confirmed',
        reference: old?.reference ?? null,
        notes: old?.notes ?? notes,
        receiptConfirmed: true,
        tradingPayoutWithdrawn: old?.tradingPayoutWithdrawn ?? false,
      })
      // Strict Zod input needs only schema fields; historical source snapshots remain owned by Income.
      const clean = incomeTransactionSchema.parse(
        Object.fromEntries(
          Object.keys(incomeTransactionSchema.shape).map((k) => [
            k,
            values[k as keyof typeof values],
          ]),
        ),
      )
      const result = old
        ? services.income.editTransaction(user, home, old.id, {
            revision: old.revision,
            reason: 'Confirmed actual bank deposit',
            values: clean,
          })
        : services.income.createTransaction(user, home, {
            idempotencyKey: randomUUID(),
            values: clean,
          })
      return { incomeId: result.id }
    }
    if (p.classification === 'refund') return { refundId: refunds.create(user, home, data, p) }
    const counterpart = p.counterpartId
        ? data.counterpartTransactions.find((v) => v.id === p.counterpartId)
        : null,
      existing = store
        .legs(home)
        .find((v) => v.transactionId === t.id || v.transactionId === counterpart?.id),
      transferId = existing?.transferId ?? store.transfer(home, user.id).id,
      records = counterpart ? [t, counterpart] : [t]
    for (const leg of records) {
      const old = store.legs(home).find((v) => v.transactionId === leg.id)
      if (old && old.transferId !== transferId)
        throw new FinancialError('The transfer leg is already paired elsewhere.', 409)
      if (!old)
        store.leg({
          transactionId: leg.id,
          householdId: home,
          transferId,
          direction: leg.amountCents > 0 ? 'inflow' : 'outflow',
        })
    }
    return { transferId }
  }
}
