import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthService } from './auth.service'

export const SESSION_COOKIE = 'goxfinance_session'
const SESSION_SECONDS = 7 * 24 * 60 * 60

export function authController(service: AuthService, secureCookie: boolean) {
  const cookie = { httpOnly: true, sameSite: 'strict' as const, secure: secureCookie, path: '/', maxAge: SESSION_SECONDS }
  const token = (request: FastifyRequest) => request.cookies[SESSION_COOKIE]

  return {
    signup: async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await service.signup(request.body)
      reply.setCookie(SESSION_COOKIE, result.token, cookie)
      return reply.code(201).send({ user: result.user })
    },
    login: async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await service.login(request.body)
      reply.setCookie(SESSION_COOKIE, result.token, cookie)
      return reply.send({ user: result.user })
    },
    me: async (request: FastifyRequest, reply: FastifyReply) => reply.send({ user: service.currentUser(token(request)) }),
    logout: async (request: FastifyRequest, reply: FastifyReply) => {
      service.logout(token(request))
      reply.clearCookie(SESSION_COOKIE, { path: '/' })
      return reply.code(204).send()
    },
  }
}
