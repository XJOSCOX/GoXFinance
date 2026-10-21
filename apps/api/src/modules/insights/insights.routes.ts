import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthService } from '../auth/auth.service'
import type { InsightsService } from './insights.service'
export function registerInsightsRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: InsightsService,
) {
  const base = '/api/households/:householdId/insights',
    params = z.object({ householdId: z.uuid(), id: z.uuid().optional() }),
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base, (r) => service.list(user(r), params.parse(r.params).householdId))
  app.post(base + '/preview', (r) =>
    service.preview(user(r), params.parse(r.params).householdId, r.body),
  )
  app.post(base + '/actions', (r) =>
    service.save(user(r), params.parse(r.params).householdId, r.body),
  )
  app.get(base + '/actions/:id/audit', (r) => {
    const p = params.parse(r.params)
    return service.history(user(r), p.householdId, p.id!)
  })
}
