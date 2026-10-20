import { randomUUID } from 'node:crypto'
import {
  sumCents,
  type BankReviewOptions,
  type BankProposal,
  type PublicUser,
} from '@goxfinance/shared'
import type { BankRepository } from '../bank.repository'
import type { ReviewRepository } from './review.repository'
import { FinancialError } from '../../households/financial-access'
export function bankRefundService(bank: BankRepository, store: ReviewRepository) {
  return {
    create(
      user: PublicUser,
      home: string,
      data: BankReviewOptions,
      p: Extract<BankProposal, { classification: 'refund' }>,
    ) {
      const t = data.transaction,
        a = data.account,
        amount = t.amountCents,
        now = new Date().toISOString(),
        expense =
          p.originalType === 'expense' ? data.expenses.find((e) => e.id === p.originalId) : null,
        bill =
          p.originalType === 'bill_payment'
            ? data.bills.find((b) => b.payments.some((v) => v.id === p.originalId))
            : null,
        billPayment = bill?.payments.find((v) => v.id === p.originalId),
        debtPayment =
          p.originalType === 'debt_payment'
            ? data.payments.find((v) => v.id === p.originalId)
            : billPayment?.debtPaymentId
              ? data.payments.find((v) => v.id === billPayment.debtPaymentId)
              : null,
        debt = debtPayment ? data.debts.find((d) => d.id === debtPayment.debtId) : null,
        original = expense ?? debtPayment ?? billPayment
      if (!original) throw new FinancialError('Original completed transaction not found.', 404)
      const date = expense?.transactionDate ?? debtPayment?.paymentDate ?? billPayment!.paymentDate,
        method = expense?.paymentMethod ?? debtPayment?.paymentMethod ?? billPayment!.method,
        parent = {
          expenseId: expense?.id ?? null,
          debtPaymentId: debtPayment?.id ?? null,
          billPaymentId: debtPayment ? null : (billPayment?.id ?? null),
        },
        existing = store.refunds(home).find((r) => r.transactionId === t.id),
        previous = store
          .refunds(home)
          .filter(
            (r) =>
              r.status === 'completed' &&
              r.id !== existing?.id &&
              ((parent.expenseId && r.expenseId === parent.expenseId) ||
                (parent.debtPaymentId && r.debtPaymentId === parent.debtPaymentId) ||
                (parent.billPaymentId && r.billPaymentId === parent.billPaymentId)),
          )
      if (
        amount <= 0 ||
        t.date < date ||
        sumCents([amount, ...previous.map((r) => r.amountCents)]) > original.amountCents
      )
        throw new FinancialError(
          'Refund must follow the original date and cannot exceed its unrefunded amount.',
          409,
        )
      if ((method === 'credit_card') !== (a.type === 'credit_card'))
        throw new FinancialError('Refund must match the original payment account type.', 409)
      let allocations = p.allocations
      if (debtPayment) {
        if (allocations.length)
          throw new FinancialError(
            'A debt repayment refund reverses cash paid, not purchase spending.',
            400,
          )
      } else {
        if (!allocations.length || sumCents(allocations.map((v) => v.amountCents)) !== amount)
          throw new FinancialError('Allocate the refund total to categories explicitly.', 400)
        if (allocations.some((v) => !data.categories.some((c) => c.id === v.categoryId)))
          throw new FinancialError('Refund category not found in this household.', 404)
        allocations = [...allocations]
      }
      if (
        existing &&
        Object.entries(parent).some(([k, v]) => existing[k as keyof typeof existing] !== v)
      )
        throw new FinancialError(
          'Correct the existing refund against its original record; its parent cannot change.',
          409,
        )
      const id = existing?.id ?? randomUUID(),
        members = expense
          ? [expense.responsibleMemberId]
          : (debt?.memberAssignments.map((v) => v.memberId) ?? bill!.memberIds)
      if (existing) {
        store.patchRefund(home, id, {
          amountCents: amount,
          date: t.date,
          method,
          status: 'completed',
          updatedAt: now,
        })
        store.refundAllocations(home, id, allocations)
      } else
        store.refund(
          {
            ...parent,
            id,
            householdId: home,
            transactionId: t.id,
            amountCents: amount,
            date: t.date,
            method,
            status: 'completed',
            notes: 'Explicitly reconciled bank refund',
            createdByUserId: user.id,
            createdAt: now,
            updatedAt: now,
          },
          allocations,
          members,
        )
      bank.audit(home, user.id, id, existing ? 'refund_corrected' : 'refund_recorded', {
        before: existing ?? null,
        ...parent,
        transactionId: t.id,
        amountCents: amount,
        allocations,
      })
      return id
    },
  }
}
