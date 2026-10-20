import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthService } from '../../auth/auth.service'
import type { bankReviewService } from './review.service'
export function registerBankReviewRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ReturnType<typeof bankReviewService>,
) {
  const base = '/api/households/:householdId/banking',
    params = z.object({ householdId: z.uuid(), id: z.uuid() }),
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base + '/transactions/:id/review', (r) => {
    const p = params.parse(r.params)
    return service.options(user(r), p.householdId, p.id)
  })
  app.post(base + '/refunds/:id/cancel', (r) => {
    const p = params.parse(r.params),
      body = z.object({ revision: z.number().int().positive() }).strict().parse(r.body)
    return service.cancelRefund(user(r), p.householdId, p.id, body.revision)
  })
  app.post(base + '/transactions/:id/preview', (r) => {
    const p = params.parse(r.params)
    return service.preview(user(r), p.householdId, p.id, r.body)
  })
  app.post(base + '/transactions/:id/reconcile', (r) => {
    const p = params.parse(r.params)
    return service.submit(user(r), p.householdId, p.id, r.body)
  })
  app.post(base + '/requests/:id/decision', (r) => {
    const p = params.parse(r.params),
      body = z
        .object({ decision: z.enum(['approve', 'reject', 'cancel']) })
        .strict()
        .parse(r.body)
    return service.decide(user(r), p.householdId, p.id, body.decision)
  })
}
