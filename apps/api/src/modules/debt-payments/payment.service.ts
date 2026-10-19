import { calculateDebtPaymentOverview, createDebtPaymentSchema,
  verifyDebtBalanceSchema, type DebtBalanceHistory, type DebtPayment, type PublicUser } from '@goxfinance/shared'
import { ZodError } from 'zod'
import { preparePaymentEdit } from './payment-edit'
import type { DebtService } from '../debts/debt.service'
import type { PaymentRepository } from './payment.repository'

export class PaymentError extends Error {
  constructor(message: string, public statusCode: number) { super(message) }
}

export function paymentService(debts: DebtService, repository: PaymentRepository,
  authorizeLinkedPayment?: (user: PublicUser, householdId: string, debtId: string, paymentId: string) => void) {
  function get(user: PublicUser, householdId: string, debtId: string, paymentId: string) {
    debts.authorizePayment(user, householdId, debtId, 'view')
    const payment = repository.find(householdId, debtId, paymentId)
    if (!payment) throw new PaymentError('Payment not found', 404)
    return payment
  }
  function overview(user: PublicUser, householdId: string, debtId: string) {
    const debt = debts.authorizePayment(user, householdId, debtId, 'view')
    return calculateDebtPaymentOverview(debt, repository.list(householdId, debtId) as DebtPayment[],
      repository.listBalances(householdId, debtId) as DebtBalanceHistory[])
  }
  function previewEdit(user: PublicUser, householdId: string, debtId: string, paymentId: string, input: unknown) {
    const current = get(user, householdId, debtId, paymentId) as DebtPayment
    try { return preparePaymentEdit(current, input) }
    catch (error) { if (error instanceof ZodError) throw error; throw new PaymentError(error instanceof Error ? error.message : 'Invalid edit', 409) }
  }
  return {
    previewEdit,
    list(user: PublicUser, householdId: string, debtId: string) {
      debts.authorizePayment(user, householdId, debtId, 'view')
      return { payments: repository.list(householdId, debtId), overview: overview(user, householdId, debtId) }
    },
    get(user: PublicUser, householdId: string, debtId: string, paymentId: string) {
      const payment = get(user, householdId, debtId, paymentId)
      const audit = repository.auditHistory(householdId, debtId, paymentId).map(item => ({
        id: item.id, action: item.action, actorUserId: item.actorUserId, createdAt: item.createdAt,
      }))
      return { payment, audit }
    },
    create(user: PublicUser, householdId: string, debtId: string, input: unknown) {
      debts.authorizePayment(user, householdId, debtId, 'create')
      const values = createDebtPaymentSchema.parse(input)
      const existing = repository.findByKey(householdId, debtId, values.idempotencyKey)
      if (existing) {
        const matches = Object.entries(values).every(([key, value]) => existing[key as keyof typeof existing] === value)
        if (!matches) throw new PaymentError('This submission key was already used for a different payment', 409)
        return { payment: existing, created: false }
      }
      try { return { payment: repository.create(householdId, debtId, user.id, values), created: true } }
      catch (error) {
        const raced = repository.findByKey(householdId, debtId, values.idempotencyKey)
        if (raced && Object.entries(values).every(([key, value]) => raced[key as keyof typeof raced] === value)) {
          return { payment: raced, created: false }
        }
        throw error
      }
    },
    update(user: PublicUser, householdId: string, debtId: string, paymentId: string, input: unknown) {
      authorizeLinkedPayment?.(user, householdId, debtId, paymentId)
      debts.authorizePayment(user, householdId, debtId, 'modify')
      const values = previewEdit(user, householdId, debtId, paymentId, input)
      return repository.update(householdId, debtId, paymentId, user.id, values, 'edited')
    },
    cancel(user: PublicUser, householdId: string, debtId: string, paymentId: string) {
      authorizeLinkedPayment?.(user, householdId, debtId, paymentId)
      debts.authorizePayment(user, householdId, debtId, 'modify')
      const current = get(user, householdId, debtId, paymentId)
      if (current.paymentStatus === 'cancelled') throw new PaymentError('Payment is already cancelled', 409)
      return repository.update(householdId, debtId, paymentId, user.id, { paymentStatus: 'cancelled' }, 'cancelled')
    },
    confirm(user: PublicUser, householdId: string, debtId: string, paymentId: string) {
      authorizeLinkedPayment?.(user, householdId, debtId, paymentId)
      debts.authorizePayment(user, householdId, debtId, 'modify')
      const current = get(user, householdId, debtId, paymentId)
      if (current.paymentStatus !== 'scheduled' && current.paymentStatus !== 'pending') {
        throw new PaymentError('Only scheduled or pending payments can be confirmed', 409)
      }
      return repository.update(householdId, debtId, paymentId, user.id, { paymentStatus: 'completed' }, 'confirmed')
    },
    balances(user: PublicUser, householdId: string, debtId: string) {
      debts.authorizePayment(user, householdId, debtId, 'view')
      return { history: repository.listBalances(householdId, debtId), overview: overview(user, householdId, debtId) }
    },
    verifyBalance(user: PublicUser, householdId: string, debtId: string, input: unknown) {
      return repository.transaction(() => {
      const debt = debts.authorizePayment(user, householdId, debtId, 'reconcile')
      const values = verifyDebtBalanceSchema.parse(input)
      if (values.idempotencyKey) {
        const existing = repository.findBalanceByKey(householdId, debtId, values.idempotencyKey)
        if (existing) {
          if (['balanceCents', 'effectiveDate', 'source', 'notes'].some(key => existing[key as keyof typeof existing] !== values[key as keyof typeof values])) {
            throw new PaymentError('This submission key was already used for a different balance', 409)
          }
          return { entry: existing, overview: overview(user, householdId, debtId) }
        }
      }
      const latest = repository.listBalances(householdId, debtId).find(item => item.source === 'creditor_statement' || item.source === 'reconciliation')
      const currentDate = [latest?.effectiveDate, debt.balanceVerifiedAt?.slice(0, 10)].filter(Boolean).sort().at(-1)
      const entry = repository.recordBalance(householdId, debtId, user.id, values,
        !currentDate || values.effectiveDate >= currentDate)
      return { entry, overview: overview(user, householdId, debtId) }
      })
    },
  }
}

export type PaymentService = ReturnType<typeof paymentService>
