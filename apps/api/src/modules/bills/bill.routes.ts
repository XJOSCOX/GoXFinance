import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthService } from '../auth/auth.service'
import type { BillService } from './bill.service'
import type { billRequestsService } from './bill-requests.service'

const params = z.object({
  householdId: z.uuid(),
  billId: z.uuid().optional(),
  periodId: z.uuid().optional(),
  requestId: z.uuid().optional(),
})
export function registerBillRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: BillService,
  requests: ReturnType<typeof billRequestsService>,
) {
  const user = (request: FastifyRequest) => auth.currentUser(request.cookies[auth.sessionCookieName])
  const base = '/api/households/:householdId/bills'
  app.get(base, (request) => ({
    bills: service.list(user(request), params.parse(request.params).householdId),
  }))
  app.post(base + '/refresh', (request) => {
    service.refresh(user(request), params.parse(request.params).householdId)
    return { success: true }
  })
  app.post(base, (request, reply) =>
    reply.code(201).send({
      bill: service.create(user(request), params.parse(request.params).householdId, request.body),
    }),
  )
  app.get(base + '/:billId', (request) => {
    const p = params.parse(request.params)
    return service.get(user(request), p.householdId, p.billId!)
  })
  app.post(base + '/:billId/actions', (request) => {
    const p = params.parse(request.params)
    return { bill: service.apply(user(request), p.householdId, p.billId!, request.body) }
  })
  app.post(base + '/:billId/periods/:periodId/payments', (request) => {
    const p = params.parse(request.params)
    return {
      bill: service.addPayment(user(request), p.householdId, p.billId!, p.periodId!, request.body),
    }
  })
  app.get(base + '/requests', (request) => ({
    requests: requests.list(user(request), params.parse(request.params).householdId),
  }))
  app.post(base + '/:billId/requests', (request) => {
    const p = params.parse(request.params)
    return { id: requests.submit(user(request), p.householdId, p.billId!, request.body) }
  })
  app.post(base + '/requests/:requestId/review', (request) => {
    const p = params.parse(request.params),
      body = z
        .object({
          action: z.enum(['approve', 'reject', 'cancel']),
          note: z.string().trim().max(2000).nullable().default(null),
        })
        .strict()
        .parse(request.body)
    requests.review(user(request), p.householdId, p.requestId!, body.action, body.note)
    return { success: true }
  })
}
