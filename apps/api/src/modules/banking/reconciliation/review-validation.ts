import { bankHash } from '../imports/import.service'
import { FinancialError } from '../../households/financial-access'
import { localBillDate, type BankProposal, type BankReviewOptions } from '@goxfinance/shared'
import { nearBankDate } from './review-context'
import type { BankPermissions } from '../bank.permissions'
function fail(message: string, status = 400): never {
  throw new FinancialError(message, status)
}
export function validateBankProposal(
  access: BankPermissions,
  actor: string,
  home: string,
  data: BankReviewOptions,
  p: BankProposal,
) {
  const ctx = access.context({ id: actor }, home),
    a = access.account({ id: actor }, home, data.account.id, true),
    t = data.transaction,
    amount = Math.abs(t.amountCents),
    self = ctx.self?.id,
    owner = ctx.role === 'owner'
  const scope = (members: string[]) => {
      if (!owner && (!self || !members.includes(self)))
        fail('This financial record is outside your permitted member scope.', 403)
    },
    matching = (value: number, date: string, method: string) => {
      if (value !== amount || !nearBankDate(date, t.date))
        fail('Select the same amount and a record within seven days of the bank posting date.', 409)
      if ((method === 'credit_card') !== (a.type === 'credit_card'))
        fail('The financial record payment method does not match this bank account.', 409)
    }
  if (p.classification === 'ignore')
    return {
      fingerprint: bankHash({ account: a.id, revision: a.revision, proposal: p }),
      target: null,
    }
  if (t.pending || t.removed || t.reviewStatus === 'superseded')
    fail('Only posted, retained transactions can be reconciled.', 409)
  if (t.date > localBillDate()) fail('Future transactions cannot be confirmed as actual activity.')
  if (t.currency !== 'USD' || a.currency !== 'USD')
    fail(
      'The current financial ledger uses USD. Unknown or other currencies can remain in the inbox; no currency conversion is assumed.',
    )
  const inflow = t.amountCents > 0
  if (['expense', 'fee', 'bill_payment', 'debt_payment'].includes(p.classification) && inflow)
    fail('This classification requires an outflow.')
  if (['income', 'refund'].includes(p.classification) && !inflow)
    fail('This classification requires an inflow.')
  let target: unknown = null
  if (p.classification === 'expense' || p.classification === 'fee') {
    if (p.expenseId) {
      const e = data.expenses.find((e) => e.id === p.expenseId)
      if (!e || e.voided) fail('Expense not found or voided.', 404)
      scope([e.responsibleMemberId])
      matching(e.amountCents, e.transactionDate, e.paymentMethod)
      target = e
    } else {
      const e = p.expense!
      scope([e.responsibleMemberId])
      if (
        e.amountCents !== amount ||
        e.transactionDate !== t.date ||
        e.paymentMethod !== (a.type === 'credit_card' ? 'credit_card' : 'bank_transfer') ||
        e.linkedDebtId !== (a.type === 'credit_card' ? a.debtId : null)
      )
        fail('The new expense must preserve the bank amount, date, account type and debt mapping.')
      if (!data.members.some((m) => m.id === e.responsibleMemberId))
        fail('Select a responsible household member.')
      if (e.linkedDebtId && !data.debts.some((d) => d.id === e.linkedDebtId))
        fail('Linked debt is outside your member scope.', 403)
      if (
        e.allocations.some(
          (l) => !data.categories.some((c) => c.id === l.categoryId && !c.archived),
        )
      )
        fail('Select active household categories.')
      target = e
    }
  } else if (p.classification === 'bill_payment') {
    const b = data.bills.find((b) => b.id === p.billId),
      period = b?.periods.find((r) => r.id === p.periodId)
    if (!b || !period) fail('Bill or billing period not found.', 404)
    scope(b.memberIds)
    if (p.paymentId && p.existingDebtPaymentId)
      fail('Choose a bill payment or an existing debt payment, not both.')
    if (period.linkedDebtId) {
      const d = data.debts.find((d) => d.id === period.linkedDebtId)
      if (!d) fail('Linked debt is outside your member scope.', 403)
      scope(d.memberAssignments.map((m) => m.memberId))
    }
    if (p.paymentId) {
      const payment = b.payments.find((r) => r.id === p.paymentId && r.periodId === period.id)
      if (!payment || payment.status !== 'completed')
        fail('Select a completed payment in this billing period.', 409)
      matching(payment.amountCents, payment.paymentDate, payment.method)
      if (
        p.billedAmountCents !== null ||
        [p.principalAmountCents, p.interestAmountCents, p.feesAmountCents].some((v) => v !== null)
      )
        fail(
          'Linking preserves the existing bill/payment values. Correct them in Bills before linking.',
        )
    } else if (b.status === 'cancelled') fail('Cancelled bills cannot receive a new payment.', 409)
    const existingDebt = p.existingDebtPaymentId
      ? data.payments.find(
          (v) => v.id === p.existingDebtPaymentId && v.debtId === period.linkedDebtId,
        )
      : null
    if (p.existingDebtPaymentId) {
      if (!existingDebt || existingDebt.paymentStatus !== 'completed')
        fail('Choose a completed payment on this billing period’s linked debt.', 404)
      matching(existingDebt.amountCents, existingDebt.paymentDate, existingDebt.paymentMethod)
      if (data.bills.some((b) => b.payments.some((v) => v.debtPaymentId === existingDebt.id)))
        fail(
          'That debt payment already has a bill reference. Select its existing bill payment.',
          409,
        )
      if (
        ['principalAmountCents', 'interestAmountCents', 'feesAmountCents'].some(
          (k) =>
            p[k as keyof typeof p] !== null &&
            p[k as keyof typeof p] !== existingDebt[k as keyof typeof existingDebt],
        )
      )
        fail('Existing debt payment allocations cannot be changed by linking.')
    }
    target = existingDebt ? { bill: b, payment: existingDebt } : b
  } else if (p.classification === 'debt_payment') {
    const d = data.debts.find((d) => d.id === p.debtId)
    if (!d) fail('Debt not found in your member scope.', 404)
    scope(d.memberAssignments.map((m) => m.memberId))
    if (p.paymentId) {
      const payment = data.payments.find((v) => v.debtId === d.id && v.id === p.paymentId)
      if (!payment || payment.paymentStatus !== 'completed')
        fail('Select a completed debt payment.', 409)
      matching(payment.amountCents, payment.paymentDate, payment.paymentMethod)
      if (
        [p.principalAmountCents, p.interestAmountCents, p.feesAmountCents].some((v) => v !== null)
      )
        fail(
          'Linking does not change principal, interest or fees. Correct the existing debt payment first.',
        )
      target = { debt: d, payment }
    } else {
      if (d.isArchived) fail('Restore the debt before recording a new payment.', 409)
      target = d
    }
  } else if (p.classification === 'income') {
    if (a.type === 'credit_card')
      fail('A credit-card credit is not household income. Review transfers or refunds.')
    const s = data.income.sources.find((s) => s.id === p.sourceId)
    if (!s) fail('Income source not found in your member scope.', 404)
    scope([s.responsibleMemberId])
    const transaction = p.transactionId
      ? data.income.transactions.find((v) => v.id === p.transactionId && v.sourceId === s.id)
      : null
    if (p.transactionId && !transaction) fail('Income transaction not found.', 404)
    if (transaction) {
      if (transaction.status === 'cancelled') fail('Cancelled income cannot be linked.', 409)
      if (transaction.status === 'confirmed') {
        if (
          transaction.actualNetCents !== amount ||
          !transaction.depositDate ||
          !nearBankDate(transaction.depositDate, t.date)
        )
          fail('Confirmed income must match the actual deposit and date.', 409)
        if (
          (p.actualGrossCents !== null && p.actualGrossCents !== transaction.actualGrossCents) ||
          (p.deductionsCents !== null && p.deductionsCents !== transaction.deductionsCents)
        )
          fail(
            'Linking preserves confirmed gross pay and deductions. Correct the existing paycheck first.',
          )
      } else if (!p.confirmPending)
        fail('Confirm the actual receipt before changing pending income.')
    } else if (s.incomeType === 'trading_payout')
      fail(
        'Confirm or link the payout through Trading first, then link its existing Income transaction. Do not create a second payout income record.',
        409,
      )
    target = { source: s, transaction }
  } else if (p.classification === 'transfer') {
    const other = p.counterpartId
      ? data.counterpartTransactions.find((v) => v.id === p.counterpartId)
      : null
    if (p.counterpartId && !other)
      fail('Select an opposite, matching posted leg from another accessible account.', 404)
    if (other) access.account({ id: actor }, home, other.accountId, true)
    target = other
  } else if (p.classification === 'refund') {
    if (p.originalType === 'expense') {
      const e = data.expenses.find((e) => e.id === p.originalId)
      if (!e || e.voided) fail('Original expense not found.', 404)
      scope([e.responsibleMemberId])
      target = e
    } else if (p.originalType === 'bill_payment') {
      const b = data.bills.find((b) => b.payments.some((v) => v.id === p.originalId)),
        payment = b?.payments.find((v) => v.id === p.originalId)
      if (!b || !payment || payment.status !== 'completed')
        fail('Original bill payment not found.', 404)
      scope(b.memberIds)
      target = { bill: b, payment }
    } else {
      const payment = data.payments.find((v) => v.id === p.originalId),
        d = data.debts.find((d) => d.id === payment?.debtId)
      if (!d || !payment || payment.paymentStatus !== 'completed')
        fail('Original debt payment not found.', 404)
      scope(d.memberAssignments.map((m) => m.memberId))
      target = { debt: d, payment }
    }
    if (
      new Set(p.allocations.map((l) => l.categoryId)).size !== p.allocations.length ||
      (p.allocations.length &&
        p.allocations.reduce((n, l) => n + BigInt(l.amountCents), 0n) !== BigInt(amount))
    )
      fail('Refund category allocations must equal the refund total.')
  }
  if (
    'principalAmountCents' in p &&
    BigInt(p.principalAmountCents ?? 0) +
      BigInt(p.interestAmountCents ?? 0) +
      BigInt(p.feesAmountCents ?? 0) >
      BigInt(amount)
  )
    fail('Principal, interest and fees cannot exceed the actual payment.')
  const canonical = JSON.parse(
    JSON.stringify(target, (key, value) =>
      ['canManage', 'requiresApproval'].includes(key) ? undefined : value,
    ),
  )
  return {
    fingerprint: bankHash({
      account: {
        id: a.id,
        revision: a.revision,
        type: a.type,
        currency: a.currency,
        memberIds: a.memberIds,
      },
      target: canonical,
      proposal: p,
    }),
    target,
  }
}
