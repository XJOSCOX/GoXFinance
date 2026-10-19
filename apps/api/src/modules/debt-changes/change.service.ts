import { createHash, randomUUID } from 'node:crypto'
import { debtChangeInputSchema, type PublicUser } from '@goxfinance/shared'
import type { DebtService } from '../debts/debt.service'
import { PaymentError, type PaymentService } from '../debt-payments/payment.service'
import type { PaymentRepository } from '../debt-payments/payment.repository'
import type { HouseholdRepository } from '../households/household.repository'
import type { ChangeRepository } from './change.repository'

const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function changeService(households: HouseholdRepository, debts: DebtService, payments: PaymentService,
  paymentStore: PaymentRepository, store: ChangeRepository) {
  function role(user: PublicUser, householdId: string) {
    const assignment = households.findRole(householdId, user.id)
    if (!assignment) throw new PaymentError('Household not found', 404)
    return assignment.role
  }
  function snapshot(user: PublicUser, householdId: string, debtId: string, paymentId: string | null) {
    const debt = debts.get(user, householdId, debtId)
    return paymentId ? { debt, payment: payments.get(user, householdId, debtId, paymentId).payment }
      : { debt, balances: paymentStore.listBalances(householdId, debtId) }
  }
  return {
    list(user: PublicUser, householdId: string) {
      const owner = role(user, householdId) === 'owner'
      return store.list(householdId).filter(item => owner || item.proposedByUserId === user.id)
    },
    submit(user: PublicUser, householdId: string, debtId: string, input: unknown) {
      return store.transaction(() => {
        debts.authorizeChangeRequest(user, householdId, debtId)
        const values = debtChangeInputSchema.parse(input)
        const paymentId = 'paymentId' in values ? values.paymentId : null
        const payload = 'changes' in values ? values.changes : {}
        const existing = store.findKey(householdId, user.id, values.idempotencyKey)
        if (existing) {
          if (existing.debtId !== debtId || existing.action !== values.action || existing.paymentId !== paymentId ||
            existing.payloadJson !== JSON.stringify(payload) || existing.reason !== values.reason) throw new PaymentError('Submission key already used', 409)
          return existing.id
        }
        if (store.list(householdId).some(item => item.status === 'pending' && item.debtId === debtId &&
          item.proposedByUserId === user.id && item.paymentId === paymentId)) throw new PaymentError('A request for this record is already pending', 409)
        const state = snapshot(user, householdId, debtId, paymentId)
        if (values.action === 'edit_payment') payments.previewEdit(user, householdId, debtId, values.paymentId, values.changes)
        if (values.action === 'cancel_payment' && state.payment?.paymentStatus === 'cancelled') throw new PaymentError('Payment is already cancelled', 409)
        if (values.action === 'confirm_payment' && !['scheduled', 'pending'].includes(state.payment?.paymentStatus ?? '')) throw new PaymentError('Payment cannot be confirmed', 409)
        const id = randomUUID(), now = new Date().toISOString()
        const original = 'payment' in state ? state.payment : { balanceCents: state.debt.currentBalanceCents, verifiedAt: state.debt.balanceVerifiedAt }
        store.submit({ id, householdId, debtId, paymentId, proposedByUserId: user.id, action: values.action,
          payloadJson: JSON.stringify(payload), originalJson: JSON.stringify(original), baseHash: fingerprint(state),
          reason: values.reason, idempotencyKey: values.idempotencyKey, activeTarget: paymentId ?? 'balance', createdAt: now, updatedAt: now })
        return id
      })
    },
    review(user: PublicUser, householdId: string, id: string, action: 'approve' | 'reject' | 'cancel', note: string | null) {
      return store.transaction(() => {
        role(user, householdId)
        const request = store.find(householdId, id)
        if (!request) throw new PaymentError('Change request not found', 404)
        if (request.status !== 'pending') throw new PaymentError('Request has already been reviewed', 409)
        if (action === 'cancel') {
          if (request.proposedByUserId !== user.id) throw new PaymentError('Only the requester can withdraw this request', 403)
          store.finish(householdId, id, user.id, 'cancelled', note)
          return
        }
        debts.requireOwner(user, householdId, request.debtId)
        if (request.proposedByUserId === user.id) throw new PaymentError('You cannot approve your own request', 403)
        if (action === 'reject') { store.finish(householdId, id, user.id, 'rejected', note); return }
        debts.authorizeChangeRequest({ id: request.proposedByUserId }, householdId, request.debtId)
        if (fingerprint(snapshot(user, householdId, request.debtId, request.paymentId)) !== request.baseHash) {
          throw new PaymentError('The account or payment changed. Reject this request and ask for a new proposal.', 409)
        }
        const payload = JSON.parse(request.payloadJson)
        if (request.action === 'edit_payment') payments.update(user, householdId, request.debtId, request.paymentId!, payload)
        else if (request.action === 'cancel_payment') payments.cancel(user, householdId, request.debtId, request.paymentId!)
        else if (request.action === 'confirm_payment') payments.confirm(user, householdId, request.debtId, request.paymentId!)
        else payments.verifyBalance(user, householdId, request.debtId, { ...payload, idempotencyKey: request.id })
        store.finish(householdId, id, user.id, 'approved', note)
      })
    },
  }
}
