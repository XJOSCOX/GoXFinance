import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthService } from '../auth/auth.service'
import type { HouseholdService } from './household.service'
import type { MemberService } from './member.service'

const householdParams = z.object({ householdId: z.uuid() })
const memberParams = householdParams.extend({ memberId: z.uuid() })

export function householdController(auth: AuthService, households: HouseholdService, members: MemberService) {
  const user = (request: FastifyRequest) => auth.currentUser(request.cookies[auth.sessionCookieName])
  const householdId = (request: FastifyRequest) => householdParams.parse(request.params).householdId
  const ids = (request: FastifyRequest) => memberParams.parse(request.params)

  return {
    createHousehold: (request: FastifyRequest, reply: FastifyReply) => {
      const result = households.create(user(request), request.body)
      return reply.code(result.created ? 201 : 200).send({ household: result.household })
    },
    listHouseholds: (request: FastifyRequest, reply: FastifyReply) => reply.send({ households: households.list(user(request)) }),
    getHousehold: (request: FastifyRequest, reply: FastifyReply) => reply.send({ household: households.get(user(request), householdId(request)) }),
    updateHousehold: (request: FastifyRequest, reply: FastifyReply) => reply.send({ household: households.update(user(request), householdId(request), request.body) }),
    listMembers: (request: FastifyRequest, reply: FastifyReply) => reply.send({ members: members.list(user(request), householdId(request)) }),
    createMember: (request: FastifyRequest, reply: FastifyReply) => reply.code(201).send({ member: members.create(user(request), householdId(request), request.body) }),
    getMember: (request: FastifyRequest, reply: FastifyReply) => {
      const { householdId, memberId } = ids(request)
      return reply.send({ member: members.get(user(request), householdId, memberId) })
    },
    updateMember: (request: FastifyRequest, reply: FastifyReply) => {
      const { householdId, memberId } = ids(request)
      return reply.send({ member: members.update(user(request), householdId, memberId, request.body) })
    },
    deactivateMember: (request: FastifyRequest, reply: FastifyReply) => {
      const { householdId, memberId } = ids(request)
      members.deactivate(user(request), householdId, memberId)
      return reply.code(204).send()
    },
  }
}
