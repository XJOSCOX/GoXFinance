import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.service'
import { paymentController } from './payment.controller'
import type { PaymentService } from './payment.service'

export function registerPaymentRoutes(app: FastifyInstance, auth: AuthService, payments: PaymentService) {
  const controller = paymentController(auth, payments)
  const base = '/api/households/:householdId/debts/:debtId'
  app.get(`${base}/payments`, controller.list)
  app.post(`${base}/payments`, controller.create)
  app.get(`${base}/payments/:paymentId`, controller.get)
  app.patch(`${base}/payments/:paymentId`, controller.update)
  app.post(`${base}/payments/:paymentId/cancel`, controller.cancel)
  app.post(`${base}/payments/:paymentId/confirm`, controller.confirm)
  app.get(`${base}/balances`, controller.balances)
  app.post(`${base}/balances`, controller.verifyBalance)
}
