import { z } from 'zod'
import { localBillDate } from '@goxfinance/shared'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.service'
import { SESSION_COOKIE } from '../auth/auth.controller'
import type { overviewService } from './overview.service'

export function registerOverviewRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ReturnType<typeof overviewService>,
) {
  app.get('/api/households/:householdId/overview', (request) => {
    const user = auth.currentUser(request.cookies[SESSION_COOKIE]),
      { householdId } = z.object({ householdId: z.uuid() }).parse(request.params)
    const { month = localBillDate().slice(0, 7) } = z
      .object({
        month: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
          .optional(),
      })
      .parse(request.query)
    return service.get(user, householdId, month)
  })
}
