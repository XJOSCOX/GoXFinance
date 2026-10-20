import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthService } from '../auth/auth.service'
import type { PlanningService } from './planning.service'
export function registerPlanningRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: PlanningService,
) {
  const base = '/api/households/:householdId/debt-planning',
    params = z.object({ householdId: z.uuid(), id: z.uuid().optional() }),
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base, (r) => service.list(user(r), params.parse(r.params).householdId))
  app.post(base + '/offers', (r) => ({
    record: service.offer(user(r), params.parse(r.params).householdId, r.body),
  }))
  app.patch(base + '/offers/:id', (r) => {
    const p = params.parse(r.params)
    return { record: service.offer(user(r), p.householdId, r.body, p.id) }
  })
  app.post(base + '/scenarios', (r) => ({
    record: service.scenario(user(r), params.parse(r.params).householdId, r.body),
  }))
  app.get(base + '/:id/audit', (r) => {
    const p = params.parse(r.params)
    return { audit: service.history(user(r), p.householdId, p.id!) }
  })
}
