import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { SESSION_COOKIE } from '../auth/auth.controller'
import type { AuthService } from '../auth/auth.service'
import type { MemberRequestService } from './member-request.service'

const householdParams = z.object({ householdId: z.uuid() })
const requestParams = householdParams.extend({ requestId: z.uuid() })

export function memberRequestController(auth: AuthService, requests: MemberRequestService) {
  const user = (request: FastifyRequest) => auth.currentUser(request.cookies[SESSION_COOKIE])
  const householdId = (request: FastifyRequest) => householdParams.parse(request.params).householdId
  const ids = (request: FastifyRequest) => requestParams.parse(request.params)
  return {
    list: (request: FastifyRequest, reply: FastifyReply) => reply.send({ requests: requests.list(user(request), householdId(request)) }),
    submit: (request: FastifyRequest, reply: FastifyReply) => reply.code(201).send({ request: requests.submit(user(request), householdId(request), request.body) }),
    approve: (request: FastifyRequest, reply: FastifyReply) => {
      const { householdId, requestId } = ids(request)
      return reply.send({ member: requests.approve(user(request), householdId, requestId, request.body) })
    },
    reject: (request: FastifyRequest, reply: FastifyReply) => {
      const { householdId, requestId } = ids(request)
      requests.reject(user(request), householdId, requestId)
      return reply.code(204).send()
    },
    cancel: (request: FastifyRequest, reply: FastifyReply) => {
      const { householdId, requestId } = ids(request)
      requests.cancel(user(request), householdId, requestId)
      return reply.code(204).send()
    },
  }
}
