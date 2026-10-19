import { createHash, randomUUID } from 'node:crypto'
import { billActionSchema, billRequestSchema, type PublicUser } from '@goxfinance/shared'
import type { BillRepository } from './bill.repository'
import type { BillService } from './bill.service'
import { BillError, type BillPermissions } from './bill.permissions'

const hash = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex')
export function billRequestsService(
  store: BillRepository,
  bills: BillService,
  permissions: BillPermissions,
) {
  function snapshot(user: PublicUser, householdId: string, id: string) {
    return {
      bill: bills.find(user, householdId, id),
      periods: store.periods(householdId, id),
      payments: store.payments(householdId, id),
    }
  }
  function stateHash(user: PublicUser, householdId: string, id: string) {
    const state = snapshot(user, householdId, id)
    return hash({
      ...state,
      debts: permissions.linkedDebts(user, state.bill),
      linkedPaymentAudit: store.linkedPaymentAudit(householdId, id),
    })
  }
  function authorize(user: Pick<PublicUser, 'id'>, householdId: string, id: string) {
    const bill = bills.find(user, householdId, id)
    permissions.manage(user, bill, false)
    if (!permissions.flags(user, bill).requiresApproval)
      throw new BillError('This record does not require an approval request', 403)
    return bill
  }
  return {
    list(user: PublicUser, householdId: string) {
      const owner = permissions.context(user, householdId).role === 'owner'
      return store
        .requests(householdId)
        .filter((item) => owner || item.proposedByUserId === user.id)
    },
    submit(user: PublicUser, householdId: string, id: string, input: unknown) {
      return store.transaction(() => {
        const bill = authorize(user, householdId, id),
          values = billRequestSchema.parse(input)
        const existing = store.requestKey(householdId, user.id, values.idempotencyKey)
        if (existing) {
          if (
            existing.billId !== id ||
            existing.proposalJson !== JSON.stringify(values.proposal) ||
            existing.reason !== values.reason
          )
            throw new BillError('Submission key already used', 409)
          return existing.id
        }
        const owner = { ...user, id: permissions.context(user, householdId).home.createdByUserId }
        bills.validateAction(owner, bill, values.proposal)
        const activeTarget =
          'paymentId' in values.proposal
            ? values.proposal.paymentId
            : 'periodId' in values.proposal
              ? values.proposal.periodId
              : 'account'
        if (
          store
            .requests(householdId)
            .some(
              (item) =>
                item.billId === id &&
                item.proposedByUserId === user.id &&
                item.status === 'pending' &&
                ('paymentId' in item.proposal
                  ? item.proposal.paymentId
                  : 'periodId' in item.proposal
                    ? item.proposal.periodId
                    : 'account') === activeTarget,
            )
        )
          throw new BillError('A request is already pending for this record', 409)
        const state = snapshot(user, householdId, id),
          requestId = randomUUID()
        store.insertRequest({
          id: requestId,
          householdId,
          billId: id,
          proposedByUserId: user.id,
          proposalJson: JSON.stringify(values.proposal),
          originalJson: JSON.stringify(state),
          baseHash: stateHash(user, householdId, id),
          reason: values.reason,
          idempotencyKey: values.idempotencyKey,
          activeTarget,
          createdAt: new Date().toISOString(),
        })
        store.audit(householdId, id, user.id, 'request_submitted', requestId, null, values)
        return requestId
      })
    },
    review(
      user: PublicUser,
      householdId: string,
      id: string,
      action: 'approve' | 'reject' | 'cancel',
      note: string | null,
    ) {
      return store.transaction(() => {
        permissions.context(user, householdId)
        const request = store.request(householdId, id)
        if (!request) throw new BillError('Request not found', 404)
        if (request.status !== 'pending')
          throw new BillError('Request has already been reviewed', 409)
        if (action === 'cancel') {
          if (request.proposedByUserId !== user.id)
            throw new BillError('Only the requester can withdraw', 403)
        } else {
          permissions.requireOwner(user, householdId)
          if (request.proposedByUserId === user.id)
            throw new BillError('Cannot review your own request', 403)
          if (action === 'approve') {
            authorize({ id: request.proposedByUserId }, householdId, request.billId)
            if (stateHash(user, householdId, request.billId) !== request.baseHash)
              throw new BillError(
                'The bill or payment changed. Reject this request and submit a new one.',
                409,
              )
            bills.apply(
              user,
              householdId,
              request.billId,
              billActionSchema.parse(JSON.parse(request.proposalJson)),
            )
          }
        }
        const status =
          action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled'
        store.finishRequest(householdId, id, user.id, status, note)
        store.audit(
          householdId,
          request.billId,
          user.id,
          `request_${status}`,
          id,
          { status: 'pending' },
          { status, note },
        )
      })
    },
  }
}
