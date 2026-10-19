import type { FastifyInstance } from 'fastify'

export function registerCsrfGuard(app: FastifyInstance, frontendOrigin: string) {
  app.addHook('preHandler', async (request, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
    if (request.headers.origin !== frontendOrigin || request.headers['x-goxfinance-request'] !== '1') {
      return reply.code(403).send({ code: 'ORIGIN_INVALID', error: 'Request origin could not be verified' })
    }
  })
}
