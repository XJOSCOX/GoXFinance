import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { SESSION_COOKIE } from '../auth/auth.controller'
import type { AuthService } from '../auth/auth.service'
import type { DebtService } from './debt.service'

const householdParams = z.object({ householdId: z.uuid() })
const debtParams = householdParams.extend({ debtId: z.uuid() })

export function registerDebtRoutes(app: FastifyInstance, auth: AuthService, service: DebtService) {
  const user = (request: FastifyRequest) => auth.currentUser(request.cookies[SESSION_COOKIE])
  app.get('/api/households/:householdId/debts', request =>
    service.list(user(request), householdParams.parse(request.params).householdId))
  app.post('/api/households/:householdId/debts', (request, reply) =>
    reply.code(201).send({ debt: service.create(user(request), householdParams.parse(request.params).householdId, request.body) }))
  app.get('/api/households/:householdId/debts/:debtId', request => {
    const { householdId, debtId } = debtParams.parse(request.params)
    return { debt: service.get(user(request), householdId, debtId) }
  })
  app.patch('/api/households/:householdId/debts/:debtId', request => {
    const { householdId, debtId } = debtParams.parse(request.params)
    return { debt: service.update(user(request), householdId, debtId, request.body) }
  })
  app.delete('/api/households/:householdId/debts/:debtId', request => {
    const { householdId, debtId } = debtParams.parse(request.params)
    return { debt: service.archive(user(request), householdId, debtId) }
  })
  app.post('/api/households/:householdId/debts/:debtId/restore', request => {
    const { householdId, debtId } = debtParams.parse(request.params)
    return { debt: service.restore(user(request), householdId, debtId) }
  })
}
