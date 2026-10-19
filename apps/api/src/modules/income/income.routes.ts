import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { SESSION_COOKIE } from '../auth/auth.controller'
import type { AuthService } from '../auth/auth.service'
import type { IncomeService } from './income.service'
const params = z.object({ householdId: z.uuid(), id: z.uuid().optional() })
export function registerIncomeRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: IncomeService,
) {
  const user = (r: FastifyRequest) => auth.currentUser(r.cookies[SESSION_COOKIE]),
    base = '/api/households/:householdId/income'
  app.get(base, (r) => service.list(user(r), params.parse(r.params).householdId))
  app.post(base + '/sources', (r, reply) =>
    reply
      .code(201)
      .send({ source: service.createSource(user(r), params.parse(r.params).householdId, r.body) }),
  )
  app.get(base + '/sources/:id', (r) => {
    const p = params.parse(r.params)
    return service.get(user(r), p.householdId, p.id!)
  })
  app.patch(base + '/sources/:id', (r) => {
    const p = params.parse(r.params)
    return { source: service.editSource(user(r), p.householdId, p.id!, r.body) }
  })
  app.post(base + '/sources/:id/archive', (r) => {
    const p = params.parse(r.params),
      body = z
        .object({ revision: z.number().int().positive(), isArchived: z.boolean() })
        .strict()
        .parse(r.body)
    return {
      source: service.archive(user(r), p.householdId, p.id!, body.revision, body.isArchived),
    }
  })
  app.post(base + '/transactions', (r, reply) =>
    reply
      .code(201)
      .send({
        transaction: service.createTransaction(user(r), params.parse(r.params).householdId, r.body),
      }),
  )
  app.patch(base + '/transactions/:id', (r) => {
    const p = params.parse(r.params)
    return { transaction: service.editTransaction(user(r), p.householdId, p.id!, r.body) }
  })
}
