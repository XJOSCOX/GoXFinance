import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthService } from '../auth/auth.service'
import type { expenseService } from './expense.service'
const params = z.object({ householdId: z.uuid(), expenseId: z.uuid().optional() })
export function registerExpenseRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ReturnType<typeof expenseService>,
) {
  const user = (request: FastifyRequest) => auth.currentUser(request.cookies[auth.sessionCookieName]),
    base = '/api/households/:householdId/expenses'
  app.get(base, (request) => service.list(user(request), params.parse(request.params).householdId))
  app.post(base + '/initialize', (request) => {
    service.initialize(user(request), params.parse(request.params).householdId)
    return { success: true }
  })
  app.post(base, (request, reply) =>
    reply.code(201).send({
      expense: service.create(
        user(request),
        params.parse(request.params).householdId,
        request.body,
      ),
    }),
  )
  app.get(base + '/:expenseId', (request) => {
    const p = params.parse(request.params)
    return service.get(user(request), p.householdId, p.expenseId!)
  })
  app.patch(base + '/:expenseId', (request) => {
    const p = params.parse(request.params)
    return { expense: service.update(user(request), p.householdId, p.expenseId!, request.body) }
  })
  app.delete(base + '/:expenseId', (request) => {
    const p = params.parse(request.params)
    const body = z.object({ revision: z.number().int().positive() }).strict().parse(request.body)
    return { expense: service.void(user(request), p.householdId, p.expenseId!, body.revision) }
  })
}
