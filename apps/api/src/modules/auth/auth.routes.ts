import type { FastifyInstance } from 'fastify'
import type { AuthService } from './auth.service'
import { authController } from './auth.controller'

export function registerAuthRoutes(app: FastifyInstance, service: AuthService, secureCookie: boolean) {
  const controller = authController(service, secureCookie)
  const limit = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }
  app.post('/api/auth/signup', limit, controller.signup)
  app.post('/api/auth/login', limit, controller.login)
  app.get('/api/auth/me', controller.me)
  app.post('/api/auth/logout', controller.logout)
}
