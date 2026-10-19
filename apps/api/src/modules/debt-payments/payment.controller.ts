import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { SESSION_COOKIE } from '../auth/auth.controller'
import type { AuthService } from '../auth/auth.service'
import type { PaymentService } from './payment.service'

const debtParams = z.object({ householdId: z.uuid(), debtId: z.uuid() })
const paymentParams = debtParams.extend({ paymentId: z.uuid() })

export function paymentController(auth: AuthService, payments: PaymentService) {
  const user = (request: FastifyRequest) => auth.currentUser(request.cookies[SESSION_COOKIE])
  return {
    list: (request: FastifyRequest) => {
      const { householdId, debtId } = debtParams.parse(request.params)
      return payments.list(user(request), householdId, debtId)
    },
    create: (request: FastifyRequest, reply: FastifyReply) => {
      const { householdId, debtId } = debtParams.parse(request.params)
      const result = payments.create(user(request), householdId, debtId, request.body)
      return reply.code(result.created ? 201 : 200).send({ payment: result.payment })
    },
    get: (request: FastifyRequest) => {
      const { householdId, debtId, paymentId } = paymentParams.parse(request.params)
      return payments.get(user(request), householdId, debtId, paymentId)
    },
    update: (request: FastifyRequest) => {
      const { householdId, debtId, paymentId } = paymentParams.parse(request.params)
      return { payment: payments.update(user(request), householdId, debtId, paymentId, request.body) }
    },
    cancel: (request: FastifyRequest) => {
      const { householdId, debtId, paymentId } = paymentParams.parse(request.params)
      return { payment: payments.cancel(user(request), householdId, debtId, paymentId) }
    },
    confirm: (request: FastifyRequest) => {
      const { householdId, debtId, paymentId } = paymentParams.parse(request.params)
      return { payment: payments.confirm(user(request), householdId, debtId, paymentId) }
    },
    balances: (request: FastifyRequest) => {
      const { householdId, debtId } = debtParams.parse(request.params)
      return payments.balances(user(request), householdId, debtId)
    },
    verifyBalance: (request: FastifyRequest, reply: FastifyReply) => {
      const { householdId, debtId } = debtParams.parse(request.params)
      return reply.code(201).send(payments.verifyBalance(user(request), householdId, debtId, request.body))
    },
  }
}
