import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { budgetMonthSchema } from '@goxfinance/shared'
import type { AuthService } from '../auth/auth.service'
import type { BudgetService } from './budget.service'
export function registerBudgetRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: BudgetService,
) {
  const base = '/api/households/:householdId/budgets',
    params = z.object({ householdId: z.uuid(), id: z.uuid().optional() }),
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base, (r) => {
    const p = params.parse(r.params),
      q = z.object({ month: budgetMonthSchema, member: z.uuid().optional() }).parse(r.query)
    return service.list(user(r), p.householdId, q.month, q.member ?? null)
  })
  app.post(base, (r) => ({
    record: service.save(user(r), params.parse(r.params).householdId, r.body),
  }))
  app.patch(base + '/:id', (r) => {
    const p = params.parse(r.params)
    return { record: service.save(user(r), p.householdId, r.body, p.id) }
  })
  app.post(base + '/copy', (r) => ({
    record: service.copy(user(r), params.parse(r.params).householdId, r.body),
  }))
  app.get(base + '/:id/audit', (r) => {
    const p = params.parse(r.params)
    return { audit: service.history(user(r), p.householdId, p.id!) }
  })
}
