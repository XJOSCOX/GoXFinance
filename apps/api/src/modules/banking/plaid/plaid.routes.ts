import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthService } from '../../auth/auth.service'
import type { PlaidLinkService } from './link.service'
import type { plaidSyncService } from './sync.service'
export function registerPlaidRoutes(
  app: FastifyInstance,
  auth: AuthService,
  link: PlaidLinkService,
  sync: ReturnType<typeof plaidSyncService>,
) {
  const base = '/api/households/:householdId/banking/plaid',
    params = z.object({ householdId: z.uuid(), id: z.uuid().optional() }),
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName]),
    limit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }
  app.get(base + '/status', (r) => link.status(user(r), params.parse(r.params).householdId))
  app.post(base + '/link', limit, (r) =>
    link.link(user(r), params.parse(r.params).householdId, r.body),
  )
  app.post(base + '/exchange', limit, (r) =>
    link.exchange(user(r), params.parse(r.params).householdId, r.body),
  )
  app.post(base + '/:id/preview', limit, (r) => {
    const p = params.parse(r.params)
    return sync.preview(user(r), p.householdId, p.id!)
  })
  app.post(base + '/:id/sync', (r) => {
    const p = params.parse(r.params),
      body = z.object({ previewId: z.uuid() }).strict().parse(r.body)
    return sync.confirm(user(r), p.householdId, p.id!, body.previewId)
  })
  app.post(base + '/:id/disconnect', limit, (r) => {
    const p = params.parse(r.params)
    return link.disconnect(user(r), p.householdId, p.id!)
  })
  app.post(base + '/:id/disable', (r) => {
    const p = params.parse(r.params),
      body = z.object({ disabled: z.boolean() }).strict().parse(r.body)
    return link.disable(user(r), p.householdId, p.id!, body.disabled)
  })
}
