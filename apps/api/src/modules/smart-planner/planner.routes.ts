import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthService } from '../auth/auth.service'
import type { PlannerService } from './planner.service'
export function registerPlannerRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: PlannerService,
) {
  const base = '/api/households/:householdId/planner',
    params = z.object({ householdId: z.uuid(), id: z.uuid().optional() }),
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base, (r) => service.list(user(r), params.parse(r.params).householdId))
  app.post(base + '/records', (r) =>
    service.save(user(r), params.parse(r.params).householdId, r.body),
  )
  app.patch(base + '/records/:id', (r) => {
    const p = params.parse(r.params)
    return service.save(user(r), p.householdId, r.body, p.id)
  })
  app.post(base + '/balances', (r) =>
    service.balance(user(r), params.parse(r.params).householdId, r.body),
  )
  app.post(base + '/requests/:id/review', (r) => {
    const p = params.parse(r.params)
    return service.review(user(r), p.householdId, p.id!, r.body)
  })
  app.post(base + '/snapshots', (r) =>
    service.snapshot(user(r), params.parse(r.params).householdId, r.body),
  )
  app.get(base + '/records/:id/audit', (r) => {
    const p = params.parse(r.params)
    return { history: service.history(user(r), p.householdId, p.id!) }
  })
}
