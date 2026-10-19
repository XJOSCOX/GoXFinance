import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { openDatabase } from './db/connection'
import { registerCsrfGuard } from './middleware/csrf'
import { authRepository } from './modules/auth/auth.repository'
import { registerAuthRoutes } from './modules/auth/auth.routes'
import { AuthError, authService } from './modules/auth/auth.service'

type AppOptions = { databasePath: string; frontendOrigin: string; secureCookie: boolean }

export async function buildApp(options: AppOptions) {
  const app = Fastify({ logger: false })
  const { db, sqlite } = openDatabase(options.databasePath)
  app.addHook('onClose', async () => { sqlite.close() })
  await app.register(cors, { origin: options.frontendOrigin, credentials: true })
  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  app.addHook('onSend', async (_request, reply, payload) => { reply.header('Cache-Control', 'no-store'); return payload })
  registerCsrfGuard(app, options.frontendOrigin)
  registerAuthRoutes(app, authService(authRepository(db)), options.secureCookie)
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: error.issues[0]?.message ?? 'Invalid input' })
    if (error instanceof AuthError) return reply.code(error.statusCode).send({ error: error.message })
    if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 429) {
      return reply.code(429).send({ error: 'Too many attempts. Try again later.' })
    }
    return reply.code(500).send({ error: 'Unable to complete the request' })
  })
  return app
}
