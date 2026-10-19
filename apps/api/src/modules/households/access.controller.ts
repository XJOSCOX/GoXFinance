import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { SESSION_COOKIE } from '../auth/auth.controller'
import type { AuthService } from '../auth/auth.service'
import type { AccessService } from './access.service'

const params = z.object({ householdId: z.uuid(), memberId: z.uuid() })

export function accessController(auth: AuthService, access: AccessService) {
  return {
    updateRole(request: FastifyRequest, reply: FastifyReply) {
      const { householdId, memberId } = params.parse(request.params)
      return reply.send({ member: access.updateRole(auth.currentUser(request.cookies[SESSION_COOKIE]),
        householdId, memberId, request.body) })
    },
  }
}
