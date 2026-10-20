import type {
  PublicUser,
  BankReviewOptions,
  BankMatch,
  BankClassification,
} from '@goxfinance/shared'
import { debtPaymentStatusSchema, debtPaymentMethodSchema } from '@goxfinance/shared'
import type { BankPermissions } from '../bank.permissions'
import type { ImportService } from '../imports/import.service'
import type { DebtService } from '../../debts/debt.service'
import type { PaymentService } from '../../debt-payments/payment.service'
import type { BillService } from '../../bills/bill.service'
import type { ExpenseService } from '../../expenses/expense.service'
import type { IncomeService } from '../../income/income.service'
import type { ReviewRepository } from './review.repository'
import { FinancialError } from '../../households/financial-access'
export type ReviewServices = {
  debts: DebtService
  payments: PaymentService
  bills: BillService
  expenses: ExpenseService
  income: IncomeService
}
export function nearBankDate(first: string, second: string) {
  return Math.abs(Date.parse(first) - Date.parse(second)) <= 7 * 86400000
}
export function reviewContext(
  access: BankPermissions,
  imports: ImportService,
  store: ReviewRepository,
  services: ReviewServices,
) {
  return (user: PublicUser, home: string, id: string): BankReviewOptions => {
    const ctx = access.context(user, home),
      initialized = ctx.role !== 'viewer' ? services.expenses.initialize(user, home) : undefined,
      inbox = imports.inbox(user, home),
      transaction = inbox.transactions.find((t) => t.id === id)
    void initialized
    if (!transaction) throw new FinancialError('Bank transaction not found', 404)
    const account = inbox.accounts.find((a) => a.id === transaction.accountId)!,
      owner = ctx.role === 'owner',
      self = ctx.self?.id,
      expenseData = services.expenses.list(user, home),
      income = services.income.list(user, home),
      expenses = expenseData.expenses.filter((e) => owner || e.responsibleMemberId === self),
      bills = services.bills
        .list(user, home)
        .filter((b) => owner || (b.memberIds.includes(self ?? '') && b.canManage)),
      debts = services.debts
        .list(user, home)
        .debts.filter((d) => owner || d.memberAssignments.some((m) => m.memberId === self)),
      payments = debts
        .flatMap((d) => services.payments.list(user, home, d.id).payments)
        .map((p) => ({
          ...p,
          paymentStatus: debtPaymentStatusSchema.parse(p.paymentStatus),
          paymentMethod: debtPaymentMethodSchema.parse(p.paymentMethod),
        })),
      linked = store.links(home).find((l) => l.transactionId === id),
      refund = store.refunds(home).find((r) => r.transactionId === id),
      matches: BankMatch[] = [],
      amount = Math.abs(transaction.amountCents),
      near = (date: string) => nearBankDate(transaction.date, date),
      used = store.links(home).filter((l) => l.transactionId !== id)
    for (const e of expenses.filter(
      (e) =>
        !e.voided &&
        e.amountCents === amount &&
        near(e.transactionDate) &&
        !used.some((l) => l.expenseId === e.id),
    ))
      matches.push({
        classification: 'expense',
        id: e.id,
        parentId: null,
        reason: 'Same amount and purchase date within seven days; verify merchant and account.',
      })
    for (const b of bills)
      for (const p of b.payments.filter(
        (p) =>
          p.status === 'completed' &&
          p.amountCents === amount &&
          near(p.paymentDate) &&
          !used.some(
            (l) =>
              l.billPaymentId === p.id || (p.debtPaymentId && l.debtPaymentId === p.debtPaymentId),
          ),
      ))
        matches.push({
          classification: 'bill_payment',
          id: p.id,
          parentId: b.id,
          reason:
            'Same completed bill-payment amount within seven days; select its billing period.',
        })
    for (const p of payments.filter(
      (p) =>
        p.paymentStatus === 'completed' &&
        p.amountCents === amount &&
        near(p.paymentDate) &&
        !used.some((l) => l.debtPaymentId === p.id),
    ))
      matches.push({
        classification: 'debt_payment',
        id: p.id,
        parentId: p.debtId,
        reason:
          'Same completed debt-payment amount within seven days; confirm this is the same payment.',
      })
    const sources = income.sources.filter((s) => owner || s.responsibleMemberId === self),
      sourceIds = new Set(sources.map((s) => s.id)),
      transactions = income.transactions.filter((t) => sourceIds.has(t.sourceId))
    for (const t of transactions.filter(
      (t) =>
        t.status !== 'cancelled' &&
        (t.actualNetCents ?? t.expectedNetCents) === amount &&
        near(t.depositDate ?? t.payDate) &&
        !used.some((l) => l.incomeId === t.id),
    ))
      matches.push({
        classification: 'income',
        id: t.id,
        parentId: t.sourceId,
        reason:
          'Same net/expected deposit amount and date within seven days; confirm receipt without creating another paycheck.',
      })
    return {
      ...(refund
        ? {
            refund: {
              id: refund.id,
              status: refund.status,
              originalType: refund.expenseId
                ? ('expense' as const)
                : refund.billPaymentId
                  ? ('bill_payment' as const)
                  : ('debt_payment' as const),
              originalId: refund.expenseId ?? refund.billPaymentId ?? refund.debtPaymentId!,
              allocations: refund.allocations.map((a) => ({
                categoryId: a.categoryId,
                amountCents: a.amountCents,
              })),
            },
          }
        : {}),
      transaction,
      account,
      owner,
      canReview: ctx.role !== 'viewer',
      members: ctx.people
        .filter((m) => owner || m.id === self)
        .map((m) => ({ id: m.id, name: m.fullName })),
      expenses,
      categories: expenseData.categories,
      bills,
      debts,
      payments,
      income: { ...income, sources, transactions },
      counterpartTransactions: inbox.transactions.filter(
        (t) =>
          t.id !== id &&
          t.accountId !== account.id &&
          !t.pending &&
          !t.removed &&
          t.amountCents === -transaction.amountCents &&
          t.currency === transaction.currency &&
          near(t.date),
      ),
      matches:
        transaction.amountCents > 0
          ? matches.filter((m) => m.classification === 'income')
          : matches.filter((m) => m.classification !== 'income'),
      existingLink: linked
        ? {
            classification: linked.classification as BankClassification,
            id:
              linked.expenseId ??
              linked.incomeId ??
              linked.debtPaymentId ??
              linked.billPaymentId ??
              linked.refundId ??
              linked.transferId ??
              linked.id,
            needsReview: transaction.reviewStatus === 'needs_review',
          }
        : null,
    }
  }
}
