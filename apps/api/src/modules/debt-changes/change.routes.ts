import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { SESSION_COOKIE } from '../auth/auth.controller'
import type { AuthService } from '../auth/auth.service'
import type { changeService } from './change.service'

const params = z.object({ householdId: z.uuid() })
const target = params.extend({ debtId: z.uuid() })
const review = params.extend({ requestId: z.uuid() })
const decision = z.object({ confirmed: z.literal(true), note: z.string().trim().max(2000).nullable().default(null) }).strict()

export function registerChangeRoutes(app: FastifyInstance, auth: AuthService, service: ReturnType<typeof changeService>) {
  app.get('/api/households/:householdId/debt-change-requests', request => ({
    requests: service.list(auth.currentUser(request.cookies[SESSION_COOKIE]), params.parse(request.params).householdId),
  }))
  app.post('/api/households/:householdId/debts/:debtId/change-requests', (request, reply) => {
    const { householdId, debtId } = target.parse(request.params)
    const id = service.submit(auth.currentUser(request.cookies[SESSION_COOKIE]), householdId, debtId, request.body)
    return reply.code(201).send({ requestId: id })
  })
  for (const action of ['approve', 'reject', 'cancel'] as const) {
    app.post(`/api/households/:householdId/debt-change-requests/:requestId/${action}`, request => {
      const { householdId, requestId } = review.parse(request.params)
      const values = decision.parse(request.body)
      service.review(auth.currentUser(request.cookies[SESSION_COOKIE]), householdId, requestId, action, values.note)
      return { success: true }
    })
  }
}
