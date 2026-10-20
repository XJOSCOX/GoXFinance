import { randomUUID } from 'node:crypto'
import {
  bankReviewSchema,
  bankReviewPreviewSchema,
  normalizeBankMerchant,
  type PublicUser,
  type BankProposal,
  type BankReviewOptions,
} from '@goxfinance/shared'
import type { BankRepository } from '../bank.repository'
import type { BankPermissions } from '../bank.permissions'
import type { ReviewRepository } from './review.repository'
import type { reviewContext } from './review-context'
import type { reviewExecutor, ReconciliationTarget } from './review-execute'
import { validateBankProposal } from './review-validation'
import { bankHash } from '../imports/import.service'
import { FinancialError } from '../../households/financial-access'
export function bankReviewService(
  bank: BankRepository,
  store: ReviewRepository,
  access: BankPermissions,
  context: ReturnType<typeof reviewContext>,
  execute: ReturnType<typeof reviewExecutor>,
) {
  function prepare(user: PublicUser, home: string, id: string, body: unknown, actor = user.id) {
    const p = bankReviewPreviewSchema.parse(body),
      data = context(user, home, id)
    if (data.transaction.revision !== p.revision)
      throw new FinancialError('Bank transaction changed. Refresh before reviewing.', 409)
    const checked = validateBankProposal(access, actor, home, data, p.proposal),
      kind = p.proposal.classification,
      isNew =
        kind === 'expense' || kind === 'fee'
          ? !p.proposal.expenseId
          : kind === 'income'
            ? !p.proposal.transactionId
            : kind === 'debt_payment' || kind === 'bill_payment'
              ? !p.proposal.paymentId
              : false
    if (
      isNew &&
      !p.newRecordConfirmed &&
      data.matches.some((m) =>
        kind === 'fee' ? m.classification === 'expense' : m.classification === kind,
      )
    )
      throw new FinancialError(
        'A matching financial record exists. Link it, or explicitly confirm this is a separate transaction.',
        409,
      )
    return {
      ...checked,
      data,
      proposal: p.proposal,
      newRecordConfirmed: p.newRecordConfirmed,
      fingerprint: bankHash([checked.fingerprint, p.newRecordConfirmed]),
    }
  }
  function existingTarget(
    home: string,
    id: string,
    proposal: BankProposal,
    data: BankReviewOptions,
  ): ReconciliationTarget | null {
    const linked = store.links(home).find((l) => l.transactionId === id)
    if (!linked) return null
    const inactive =
      linked.classification === 'ignore' ||
      (linked.expenseId
        ? data.expenses.some((e) => e.id === linked.expenseId && e.voided)
        : linked.incomeId
          ? data.income.transactions.some(
              (t) => t.id === linked.incomeId && t.status === 'cancelled',
            )
          : linked.billPaymentId
            ? data.bills.some((b) =>
                b.payments.some((p) => p.id === linked.billPaymentId && p.status === 'cancelled'),
              )
            : linked.debtPaymentId
              ? data.payments.some(
                  (p) => p.id === linked.debtPaymentId && p.paymentStatus === 'cancelled',
                )
              : linked.refundId
                ? store
                    .refunds(home)
                    .some((r) => r.id === linked.refundId && r.status === 'cancelled')
                : false)
    if (inactive) return null
    let matches = false
    if (proposal.classification === 'expense' || proposal.classification === 'fee')
      matches = !!linked.expenseId && linked.expenseId === proposal.expenseId
    else if (proposal.classification === 'income')
      matches = !!linked.incomeId && linked.incomeId === proposal.transactionId
    else if (proposal.classification === 'debt_payment')
      matches = !!linked.debtPaymentId && linked.debtPaymentId === proposal.paymentId
    else if (proposal.classification === 'bill_payment') {
      // Linked bill aliases are resolved by the executor and compared before any write.
      matches = !!proposal.paymentId && !!(linked.billPaymentId || linked.debtPaymentId)
    } else if (proposal.classification === 'refund') matches = !!linked.refundId
    else if (proposal.classification === 'ignore') matches = linked.classification === 'ignore'
    else if (proposal.classification === 'transfer') matches = linked.classification === 'transfer'
    if (!matches)
      throw new FinancialError(
        'This bank transaction already has an authoritative record. Correct or cancel that record through its existing workflow; never create a second one.',
        409,
      )
    return {
      expenseId: linked.expenseId ?? undefined,
      incomeId: linked.incomeId ?? undefined,
      debtPaymentId: linked.debtPaymentId ?? undefined,
      billPaymentId: linked.billPaymentId ?? undefined,
      refundId: linked.refundId ?? undefined,
      transferId: linked.transferId ?? undefined,
    }
  }
  function apply(user: PublicUser, home: string, id: string, prepared: ReturnType<typeof prepare>) {
    const { data, proposal } = prepared,
      old = store.links(home).find((l) => l.transactionId === id),
      target = existingTarget(home, id, proposal, data),
      result = execute(user, home, data, proposal),
      now = new Date().toISOString()
    if (target && bankHash(target) !== bankHash(result))
      throw new FinancialError('The selected record differs from the existing reconciliation.', 409)
    const duplicates = store
      .links(home)
      .find(
        (l) =>
          l.transactionId !== id &&
          Object.entries(result).some(
            ([key, value]) => value && l[key as keyof typeof l] === value && key !== 'transferId',
          ),
      )
    if (duplicates)
      throw new FinancialError(
        'That financial record is already reconciled to a different bank transaction.',
        409,
      )
    const row = {
      householdId: home,
      transactionId: id,
      classification: proposal.classification,
      expenseId: null,
      incomeId: null,
      billPaymentId: null,
      debtPaymentId: null,
      refundId: null,
      transferId: null,
      ...result,
      transactionRevision: data.transaction.revision + 1,
      targetFingerprint: bankHash(result),
      updatedAt: now,
    }
    if (old) store.patchLink(home, old.id, row)
    else store.link({ ...row, id: randomUUID(), createdByUserId: user.id, createdAt: now })
    store.transaction(home, id, {
      reviewStatus: proposal.classification === 'ignore' ? 'ignored' : 'reconciled',
      revision: data.transaction.revision + 1,
      updatedAt: now,
    })
    if (proposal.classification === 'transfer' && proposal.counterpartId && result.transferId) {
      const other = data.counterpartTransactions.find((t) => t.id === proposal.counterpartId)!,
        otherLink = store.links(home).find((l) => l.transactionId === other.id)
      if (!otherLink) {
        store.link({
          id: randomUUID(),
          householdId: home,
          transactionId: other.id,
          classification: 'transfer',
          transferId: result.transferId,
          transactionRevision: other.revision + 1,
          targetFingerprint: bankHash({ transferId: result.transferId }),
          createdByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        })
        store.transaction(home, other.id, {
          reviewStatus: 'reconciled',
          revision: other.revision + 1,
          updatedAt: now,
        })
        bank.audit(home, user.id, other.id, 'transfer_leg_reconciled', {
          transferId: result.transferId,
          pairedTransactionId: id,
        })
      } else if (
        otherLink.classification === 'transfer' &&
        otherLink.transferId !== result.transferId
      )
        throw new FinancialError('The counterpart is paired with a different transfer.', 409)
    }
    if (
      (proposal.classification === 'expense' || proposal.classification === 'fee') &&
      data.transaction.merchant
    ) {
      const e = proposal.expense ?? data.expenses.find((e) => e.id === proposal.expenseId),
        categoryId = e?.allocations.length === 1 ? e.allocations[0].categoryId : null
      if (categoryId)
        store.rule({
          id: randomUUID(),
          householdId: home,
          accountId: data.account.id,
          merchant: normalizeBankMerchant(data.transaction.merchant),
          classification: proposal.classification,
          categoryId,
          createdByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        })
    }
    bank.audit(home, user.id, id, old ? 'reconciliation_acknowledged' : 'transaction_reconciled', {
      classification: proposal.classification,
      target: result,
      before: old ?? null,
    })
    return result
  }
  return {
    cancelRefund(user: PublicUser, home: string, id: string, revision: number) {
      return bank.atomic(() => {
        access.owner(user, home)
        const refund = store.refunds(home).find((r) => r.id === id)
        if (!refund) throw new FinancialError('Refund adjustment not found.', 404)
        const tx = bank.transactions(home).find((t) => t.id === refund.transactionId)!
        if (tx.revision !== revision || refund.status !== 'completed')
          throw new FinancialError('Refund or transaction changed. Refresh before cancelling.', 409)
        const now = new Date().toISOString()
        store.patchRefund(home, id, { status: 'cancelled', updatedAt: now })
        store.transaction(home, tx.id, {
          reviewStatus: 'needs_review',
          revision: tx.revision + 1,
          updatedAt: now,
        })
        bank.audit(home, user.id, id, 'refund_cancelled', { transactionId: tx.id, before: refund })
        return { status: 'cancelled' }
      })
    },
    options: context,
    preview(user: PublicUser, home: string, id: string, body: unknown) {
      const p = prepare(user, home, id, body)
      existingTarget(home, id, p.proposal, p.data)
      return {
        fingerprint: p.fingerprint,
        requiresOwnerApproval: !p.data.owner,
        amountCents: p.data.transaction.amountCents,
        date: p.data.transaction.date,
        classification: p.proposal.classification,
      }
    },
    submit(user: PublicUser, home: string, id: string, body: unknown) {
      return bank.atomic(() => {
        const p = bankReviewSchema.parse(body),
          raw = bank.transactions(home).find((t) => t.id === id)
        if (!raw) throw new FinancialError('Bank transaction not found', 404)
        access.account(user, home, raw.accountId, true)
        const json = JSON.stringify({
            proposal: p.proposal,
            newRecordConfirmed: p.newRecordConfirmed,
          }),
          prior = store.requests(home).find((r) => r.idempotencyKey === p.idempotencyKey)
        if (prior) {
          if (
            prior.proposedByUserId !== user.id ||
            prior.transactionId !== id ||
            prior.proposalJson !== json ||
            prior.transactionRevision !== p.revision ||
            prior.targetFingerprint !== p.fingerprint
          )
            throw new FinancialError('Submission key already used.', 409)
          return { requestId: prior.id, status: prior.status, replayed: true }
        }
        const prepared = prepare(user, home, id, {
          revision: p.revision,
          proposal: p.proposal,
          newRecordConfirmed: p.newRecordConfirmed,
        })
        if (prepared.fingerprint !== p.fingerprint)
          throw new FinancialError('Financial records changed since preview. Review again.', 409)
        existingTarget(home, id, p.proposal, prepared.data)
        if (store.requests(home).some((r) => r.transactionId === id && r.status === 'pending'))
          throw new FinancialError('A review request is already pending for this transaction.', 409)
        const now = new Date().toISOString(),
          requestId = randomUUID(),
          owner = prepared.data.owner
        if (owner) apply(user, home, id, prepared)
        store.request({
          id: requestId,
          householdId: home,
          transactionId: id,
          transactionRevision: p.revision,
          proposalJson: json,
          targetFingerprint: p.fingerprint,
          status: owner ? 'approved' : 'pending',
          proposedByUserId: user.id,
          reviewedByUserId: owner ? user.id : null,
          reviewedAt: owner ? now : null,
          idempotencyKey: p.idempotencyKey,
          createdAt: now,
          updatedAt: now,
        })
        bank.audit(home, user.id, id, owner ? 'review_approved' : 'review_requested', {
          requestId,
          classification: p.proposal.classification,
        })
        return { requestId, status: owner ? 'approved' : 'pending', replayed: false }
      })
    },
    decide(user: PublicUser, home: string, id: string, decision: 'approve' | 'reject' | 'cancel') {
      return bank.atomic(() => {
        const ctx = access.context(user, home),
          request = store.requests(home).find((r) => r.id === id)
        if (!request) throw new FinancialError('Review request not found.', 404)
        if (
          decision === 'cancel'
            ? ctx.role !== 'owner' && request.proposedByUserId !== user.id
            : ctx.role !== 'owner'
        )
          throw new FinancialError(
            'Only the Owner may approve or reject reconciliation requests.',
            403,
          )
        const tx = bank.transactions(home).find((t) => t.id === request.transactionId)!
        access.account(user, home, tx.accountId, true)
        if (request.status !== 'pending')
          throw new FinancialError('Request has already been reviewed or cancelled.', 409)
        if (decision === 'approve') {
          const body = JSON.parse(request.proposalJson),
            prepared = prepare(
              user,
              home,
              tx.id,
              { ...body, revision: request.transactionRevision },
              request.proposedByUserId,
            )
          if (prepared.fingerprint !== request.targetFingerprint)
            throw new FinancialError(
              'The financial record or account changed. Reject this stale request and submit a fresh review.',
              409,
            )
          apply(user, home, tx.id, prepared)
        }
        const now = new Date().toISOString(),
          status =
            decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'cancelled'
        store.patchRequest(home, id, {
          status,
          reviewedByUserId: user.id,
          reviewedAt: now,
          updatedAt: now,
        })
        bank.audit(home, user.id, tx.id, 'review_' + status, {
          requestId: id,
          proposedByUserId: request.proposedByUserId,
        })
        return { status }
      })
    },
  }
}
