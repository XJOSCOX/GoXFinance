import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthService } from '../auth/auth.service'
import type { AssetService } from './asset.service'
export function registerAssetRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: AssetService,
) {
  const base = '/api/households/:householdId/assets',
    params = z.object({ householdId: z.uuid(), id: z.uuid().optional() }),
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base, (r) => service.list(user(r), params.parse(r.params).householdId))
  app.post(base, (r) => ({
    record: service.save(user(r), params.parse(r.params).householdId, r.body),
  }))
  app.patch(base + '/:id', (r) => {
    const p = params.parse(r.params)
    return { record: service.save(user(r), p.householdId, r.body, p.id) }
  })
  app.post(base + '/:id/valuations', (r) => {
    const p = params.parse(r.params)
    return { record: service.value(user(r), p.householdId, p.id!, r.body) }
  })
  app.get(base + '/:id/audit', (r) => {
    const p = params.parse(r.params)
    return { audit: service.history(user(r), p.householdId, p.id!) }
  })
  app.post(base + '/snapshots', (r) => ({
    record: service.capture(user(r), params.parse(r.params).householdId, r.body),
  }))
}
