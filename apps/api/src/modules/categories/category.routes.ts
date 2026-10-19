import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.service'
import type { categoryService } from './category.service'

const params = z.object({ householdId: z.uuid(), categoryId: z.uuid().optional() })
export function registerCategoryRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ReturnType<typeof categoryService>,
) {
  const base = '/api/households/:householdId/categories'
  app.get(base, (request) =>
    service.list(
      auth.currentUser(request.cookies[auth.sessionCookieName]),
      params.parse(request.params).householdId,
    ),
  )
  app.post(base, (request, reply) =>
    reply.code(201).send({
      category: service.create(
        auth.currentUser(request.cookies[auth.sessionCookieName]),
        params.parse(request.params).householdId,
        request.body,
      ),
    }),
  )
  app.patch(base + '/:categoryId', (request) => {
    const p = params.parse(request.params)
    return {
      category: service.update(
        auth.currentUser(request.cookies[auth.sessionCookieName]),
        p.householdId,
        p.categoryId!,
        request.body,
      ),
    }
  })
}
