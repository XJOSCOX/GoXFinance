import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { SESSION_COOKIE } from '../auth/auth.controller'
import type { AuthService } from '../auth/auth.service'
import type { InvitationService } from './invitation.service'

const memberParams = z.object({ householdId: z.uuid(), memberId: z.uuid() })
const invitationParams = memberParams.extend({ invitationId: z.uuid() })

export function invitationController(auth: AuthService, invitations: InvitationService) {
  const user = (request: FastifyRequest) => auth.currentUser(request.cookies[SESSION_COOKIE])
  return {
    generate: (request: FastifyRequest, reply: FastifyReply) => {
      const { householdId, memberId } = memberParams.parse(request.params)
      return reply.code(201).send(invitations.generate(user(request), householdId, memberId, request.body))
    },
    regenerate: (request: FastifyRequest, reply: FastifyReply) => {
      const { householdId, memberId, invitationId } = invitationParams.parse(request.params)
      return reply.code(201).send(invitations.regenerate(user(request), householdId, memberId, invitationId))
    },
    revoke: (request: FastifyRequest, reply: FastifyReply) => {
      const { householdId, memberId, invitationId } = invitationParams.parse(request.params)
      invitations.revoke(user(request), householdId, memberId, invitationId)
      return reply.code(204).send()
    },
    redeem: (request: FastifyRequest, reply: FastifyReply) => reply.send({ household: invitations.redeemForUser(user(request), request.body) }),
  }
}
