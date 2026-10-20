import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthService } from '../auth/auth.service'
import type { BankService } from './bank.service'
export function registerBankRoutes(app: FastifyInstance, auth: AuthService, service: BankService) {
  const base = '/api/households/:householdId/banking',
    params = z.object({ householdId: z.uuid(), id: z.uuid().optional() }),
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base, (r) => service.list(user(r), params.parse(r.params).householdId))
  app.post(base + '/accounts', (r) => ({
    record: service.save(user(r), params.parse(r.params).householdId, r.body),
  }))
  app.patch(base + '/accounts/:id', (r) => {
    const p = params.parse(r.params)
    return { record: service.save(user(r), p.householdId, r.body, p.id) }
  })
  app.post(base + '/accounts/:id/balances', (r) => {
    const p = params.parse(r.params)
    return { record: service.observe(user(r), p.householdId, p.id!, r.body) }
  })
  app.get(base + '/accounts/:id/audit', (r) => {
    const p = params.parse(r.params)
    return service.history(user(r), p.householdId, p.id!)
  })
}
