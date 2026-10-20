import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthService } from '../auth/auth.service'
import type { ForecastService } from './forecast.service'
export function registerForecastRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ForecastService,
) {
  const base = '/api/households/:householdId/forecasts',
    params = z.object({ householdId: z.uuid() }),
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base, (r) => service.list(user(r), params.parse(r.params).householdId))
  app.post(base, (r) => ({
    record: service.save(user(r), params.parse(r.params).householdId, r.body),
  }))
}
