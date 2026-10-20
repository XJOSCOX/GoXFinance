import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthService } from '../../auth/auth.service'
import type { ImportService } from './import.service'
export function registerImportRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ImportService,
) {
  const base = '/api/households/:householdId/banking',
    params = z.object({ householdId: z.uuid() }),
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base + '/inbox', (r) => service.inbox(user(r), params.parse(r.params).householdId))
  app.post(base + '/imports/columns', (r) => {
    const p = z
      .object({ accountId: z.uuid(), text: z.string().min(1).max(500000) })
      .strict()
      .parse(r.body)
    return service.columns(user(r), params.parse(r.params).householdId, p.accountId, p.text)
  })
  app.post(base + '/imports/preview', (r) =>
    service.preview(user(r), params.parse(r.params).householdId, r.body),
  )
  app.post(base + '/imports/confirm', (r) =>
    service.confirm(user(r), params.parse(r.params).householdId, r.body),
  )
}
