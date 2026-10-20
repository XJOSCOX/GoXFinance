import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthService } from '../auth/auth.service'
import type { GoalService } from './goal.service'
const params = z.object({ householdId: z.uuid(), id: z.uuid().optional() })
export function registerGoalRoutes(app: FastifyInstance, auth: AuthService, service: GoalService) {
  const base = '/api/households/:householdId/goals',
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base, (r) => service.list(user(r), params.parse(r.params).householdId))
  app.post(base, (r, reply) =>
    reply
      .code(201)
      .send({ record: service.save(user(r), params.parse(r.params).householdId, r.body) }),
  )
  app.post(base + '/batch', (r) => ({
    records: service.saveBatch(user(r), params.parse(r.params).householdId, r.body),
  }))
  app.patch(base + '/:id', (r) => {
    const p = params.parse(r.params)
    return { record: service.save(user(r), p.householdId, r.body, p.id) }
  })
  app.get(base + '/:id/audit', (r) => {
    const p = params.parse(r.params)
    return { audit: service.history(user(r), p.householdId, p.id!) }
  })
  app.post(base + '/contributions', (r, reply) =>
    reply
      .code(201)
      .send({ record: service.contribute(user(r), params.parse(r.params).householdId, r.body) }),
  )
  app.patch(base + '/contributions/:id', (r) => {
    const p = params.parse(r.params)
    return { record: service.contribute(user(r), p.householdId, r.body, p.id) }
  })
}
