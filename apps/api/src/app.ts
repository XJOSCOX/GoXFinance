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
import { householdRepository } from './modules/households/household.repository'
import { memberRepository } from './modules/households/member.repository'
import { householdService } from './modules/households/household.service'
import { memberService } from './modules/households/member.service'
import { registerHouseholdRoutes } from './modules/households/household.routes'
import { HouseholdError } from './modules/households/household.permissions'
import { invitationRepository } from './modules/households/invitation.repository'
import { InvitationError, invitationService } from './modules/households/invitation.service'

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
  const householdStore = householdRepository(db)
  const invitationStore = invitationRepository(db)
  const invitations = invitationService(householdStore, memberRepository(db), invitationStore)
  const auth = authService(authRepository(db), invitations)
  registerAuthRoutes(app, auth, options.secureCookie)
  registerHouseholdRoutes(app, auth, householdService(householdStore), memberService(householdStore, memberRepository(db), invitationStore), invitations)
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'VALIDATION_ERROR', error: error.issues[0]?.message ?? 'Invalid input' })
    if (error instanceof InvitationError) return reply.code(error.statusCode).send({ code: error.code, error: error.message })
    if (error instanceof AuthError) return reply.code(error.statusCode).send({ code: 'AUTH_ERROR', error: error.message })
    if (error instanceof HouseholdError) return reply.code(error.statusCode).send({ code: 'HOUSEHOLD_ERROR', error: error.message })
    if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 429) {
      return reply.code(429).send({ code: 'RATE_LIMITED', error: 'Too many attempts. Try again later.' })
    }
    return reply.code(500).send({ code: 'INTERNAL_ERROR', error: 'Unable to complete the request' })
  })
  return app
}
