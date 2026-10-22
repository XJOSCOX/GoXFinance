import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthService } from '../auth/auth.service'
import type { commandService } from './command.service'
export function registerCommandRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ReturnType<typeof commandService>,
) {
  const params = z.object({ householdId: z.uuid() }),
    query = z.object({
      month: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .optional(),
    }),
    base = '/api/households/:householdId/command-center',
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base, (r) =>
    service.get(user(r), params.parse(r.params).householdId, query.parse(r.query).month),
  )
  app.put(base + '/preferences', (r) =>
    service.preferences(user(r), params.parse(r.params).householdId, r.body),
  )
}
