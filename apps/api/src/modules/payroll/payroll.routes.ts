import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthService } from '../auth/auth.service'
import type { PayrollService } from './payroll.service'
import { localDocumentPreview } from './documents/document.service'
import { FinancialError } from '../households/financial-access'
const params = z.object({ householdId: z.uuid(), id: z.uuid().optional() })
export function registerPayrollRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: PayrollService,
) {
  const base = '/api/households/:householdId/income/payroll',
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base, (r) => service.list(user(r), params.parse(r.params).householdId))
  app.post(
    base + '/upload/preview',
    { bodyLimit: 15 * 1024 * 1024, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    (r) => service.uploadPreview(user(r), params.parse(r.params).householdId, r.body),
  )
  app.post(base + '/upload/save', (r) =>
    service.uploadSave(user(r), params.parse(r.params).householdId, r.body),
  )
  app.put(base + '/profile', (r) =>
    service.profile(user(r), params.parse(r.params).householdId, r.body),
  )
  app.post(base + '/weeks', (r) =>
    service.hours(user(r), params.parse(r.params).householdId, r.body),
  )
  app.patch(base + '/weeks/:id', (r) => {
    const p = params.parse(r.params)
    return service.hours(user(r), p.householdId, r.body, p.id!)
  })
  app.post(base + '/weeks/:id/pending', (r) => {
    const p = params.parse(r.params)
    return service.pending(
      user(r),
      p.householdId,
      p.id!,
      z.object({ revision: z.number().int().positive() }).strict().parse(r.body).revision,
    )
  })
  app.post(
    base + '/weeks/:id/extract',
    { bodyLimit: 15 * 1024 * 1024, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (r) => {
      const p = params.parse(r.params),
        u = user(r),
        body = z
          .object({
            revision: z.number().int().positive(),
            mime: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
            data: z.string().max(14 * 1024 * 1024),
          })
          .strict()
          .parse(r.body),
        w = service.list(u, p.householdId).weeks.find((v) => v.id === p.id)
      if (!w) throw new FinancialError('Payroll week not found', 404)
      service.source(u, p.householdId, w.sourceId, true)
      let revision = body.revision
      const preview = await localDocumentPreview(u.id, { mime: body.mime, data: body.data }, () => {
        revision = service.received(u, p.householdId, p.id!, body.revision).revision
      })
      return { ...preview, revision }
    },
  )
  app.post(base + '/weeks/:id/review', (r) => {
    const p = params.parse(r.params)
    return service.review(user(r), p.householdId, p.id!, r.body)
  })
  app.get(base + '/sources/:id/audit', (r) => {
    const p = params.parse(r.params)
    return { audit: service.history(user(r), p.householdId, p.id!) }
  })
}
