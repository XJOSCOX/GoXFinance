import { randomUUID } from 'node:crypto'
import {
  billActionSchema,
  billInputSchema,
  billPaymentInputSchema,
  billPeriodView,
  billScheduleDates,
  localBillDate,
  type Bill,
  type BillAction,
  type PublicUser,
} from '@goxfinance/shared'
import type { PaymentService } from '../debt-payments/payment.service'
import type { BillRepository } from './bill.repository'
import { BillError, type BillPermissions } from './bill.permissions'

export function billService(
  store: BillRepository,
  permissions: BillPermissions,
  debtPayments: PaymentService,
) {
  function find(user: Pick<PublicUser, 'id'>, householdId: string, id: string) {
    permissions.context(user, householdId)
    const bill = store.find(householdId, id)
    if (!bill) throw new BillError('Bill not found', 404)
    return bill
  }
  function view(user: Pick<PublicUser, 'id'>, bill: Bill) {
    const payments = store.payments(bill.householdId, bill.id)
    return {
      ...bill,
      ...permissions.flags(user, bill),
      payments,
      periods: store
        .periods(bill.householdId, bill.id)
        .map((period) =>
          billPeriodView(period, payments, bill.status === 'cancelled', localBillDate()),
        ),
    }
  }
  function materialize(bill: Bill) {
    if (bill.status === 'active')
      for (const due of billScheduleDates(bill, localBillDate())) store.createPeriod(bill, due)
  }
  function validateAction(user: PublicUser, bill: Bill, action: BillAction) {
    if (action.action === 'edit_bill')
      permissions.validate(user, bill.householdId, action.changes, bill)
    if (
      'periodId' in action &&
      !store.periods(bill.householdId, bill.id).some((period) => period.id === action.periodId)
    )
      throw new BillError('Billing period not found', 404)
    if ('paymentId' in action) {
      const payment = store
        .payments(bill.householdId, bill.id)
        .find((item) => item.id === action.paymentId)
      if (!payment) throw new BillError('Payment not found', 404)
      if (payment.status === 'cancelled')
        throw new BillError('Cancelled payments cannot be changed', 409)
      if (action.action === 'confirm_payment' && payment.status !== 'pending')
        throw new BillError('Payment has already been confirmed', 409)
    }
  }
  function apply(user: PublicUser, householdId: string, id: string, input: unknown) {
    return store.transaction(() => {
      const bill = find(user, householdId, id),
        action = billActionSchema.parse(input)
      permissions.manage(user, bill)
      validateAction(user, bill, action)
      const before = view(user, bill)
      if (action.action === 'edit_bill') {
        if (bill.kind === 'one_time') {
          const existing = store.periods(householdId, id)[0]
          if (existing && action.changes.nextDueDate !== bill.nextDueDate)
            store.reschedulePeriod(householdId, existing.id, action.changes.nextDueDate)
          if (
            existing &&
            (action.changes.amountCents !== bill.amountCents ||
              action.changes.estimatedAmountCents !== bill.estimatedAmountCents)
          ) {
            store.updatePeriod(householdId, existing.id, {
              amountCents: action.changes.amountCents,
              creditCents: existing.creditCents,
              notes: existing.notes,
            })
          }
        }
        store.update(householdId, id, action.changes)
        materialize(store.find(householdId, id)!)
      } else if (action.action === 'archive_bill')
        store.update(householdId, id, {
          ...bill,
          status: bill.kind === 'recurring' ? 'inactive' : 'cancelled',
        })
      else if (action.action === 'edit_period')
        store.updatePeriod(householdId, action.periodId, action.changes)
      else {
        const payment = store
          .payments(householdId, id)
          .find((item) => item.id === action.paymentId)!
        if (action.action === 'confirm_payment') {
          if (bill.status === 'cancelled')
            throw new BillError('Restore the bill before confirming payment', 409)
          let linked: string | null = null
          if (payment.debtId)
            linked = debtPayments.create(user, householdId, payment.debtId, {
              idempotencyKey: payment.id,
              amountCents: payment.amountCents,
              paymentDate: payment.paymentDate,
              paymentMethod: payment.method,
              notes: payment.notes,
              paymentStatus: 'completed',
            }).payment.id
          store.updatePayment(householdId, payment.id, {
            status: 'completed',
            confirmedAt: new Date().toISOString(),
            debtPaymentId: linked,
          })
        } else if (action.action === 'cancel_payment') {
          if (payment.debtPaymentId && payment.debtId)
            debtPayments.cancel(user, householdId, payment.debtId, payment.debtPaymentId)
          store.updatePayment(householdId, payment.id, { status: 'cancelled' })
        } else if (action.action === 'edit_payment') {
          if (payment.debtPaymentId && payment.debtId)
            debtPayments.update(user, householdId, payment.debtId, payment.debtPaymentId, {
              amountCents: action.changes.amountCents,
              paymentDate: action.changes.paymentDate,
              paymentMethod: action.changes.method,
              notes: action.changes.notes,
            })
          store.updatePayment(householdId, payment.id, action.changes)
        }
      }
      if (action.action !== 'edit_bill' && action.action !== 'archive_bill')
        store.touch(householdId, id)
      const result = view(user, find(user, householdId, id))
      store.audit(
        householdId,
        id,
        user.id,
        action.action,
        'paymentId' in action ? action.paymentId : 'periodId' in action ? action.periodId : id,
        before,
        result,
      )
      return result
    })
  }
  return {
    find,
    view,
    apply,
    validateAction,
    list(user: PublicUser, householdId: string) {
      permissions.context(user, householdId)
      return store.list(householdId).map((bill) => view(user, bill))
    },
    refresh(user: PublicUser, householdId: string) {
      permissions.context(user, householdId)
      return store.transaction(() => {
        for (const bill of store.list(householdId)) {
          const access = permissions.flags(user, bill)
          if (access.canManage && !access.requiresApproval) materialize(bill)
        }
      })
    },
    get(user: PublicUser, householdId: string, id: string) {
      return {
        bill: view(user, find(user, householdId, id)),
        audit: store.auditList(householdId, id),
      }
    },
    create(user: PublicUser, householdId: string, input: unknown) {
      return store.transaction(() => {
        const values = billInputSchema.parse(input)
        permissions.validate(user, householdId, values)
        if (
          store
            .list(householdId)
            .some(
              (item) =>
                item.status === 'active' &&
                item.name.toLowerCase() === values.name.toLowerCase() &&
                item.kind === values.kind &&
                item.nextDueDate === values.nextDueDate &&
                [...item.memberIds].sort().join() === [...values.memberIds].sort().join(),
            )
        )
          throw new BillError(
            'A matching bill already exists. Edit the existing bill instead.',
            409,
          )
        const bill = store.create(householdId, user.id, values)
        materialize(bill)
        store.audit(householdId, bill.id, user.id, 'created', bill.id, null, bill)
        return view(user, bill)
      })
    },
    addPayment(
      user: PublicUser,
      householdId: string,
      id: string,
      periodId: string,
      input: unknown,
    ) {
      return store.transaction(() => {
        const bill = find(user, householdId, id)
        permissions.manage(user, bill, false)
        if (bill.status === 'cancelled') throw new BillError('Bill is cancelled', 409)
        const period = store.periods(householdId, id).find((item) => item.id === periodId)
        if (!period) throw new BillError('Billing period not found', 404)
        const values = billPaymentInputSchema.parse(input),
          existing = store.findPaymentKey(householdId, values.idempotencyKey)
        if (existing) {
          if (
            existing.billId !== id ||
            existing.periodId !== periodId ||
            Object.entries(values).some(
              ([key, value]) => existing[key as keyof typeof existing] !== value,
            )
          )
            throw new BillError('Submission key already used', 409)
          return view(user, bill)
        }
        const paymentId = randomUUID(),
          now = new Date().toISOString()
        store.insertPayment({
          ...values,
          id: paymentId,
          billId: id,
          householdId,
          periodId,
          createdByUserId: user.id,
          debtId: period.linkedDebtId,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        store.touch(householdId, id)
        store.audit(householdId, id, user.id, 'payment_recorded_pending', paymentId, null, values)
        return view(user, find(user, householdId, id))
      })
    },
  }
}
export type BillService = ReturnType<typeof billService>
