import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.service'
import { householdController } from './household.controller'
import type { HouseholdService } from './household.service'
import type { MemberService } from './member.service'
import type { InvitationService } from './invitation.service'
import { invitationController } from './invitation.controller'
import type { AccessService } from './access.service'
import { accessController } from './access.controller'
import type { MemberRequestService } from './member-request.service'
import { memberRequestController } from './member-request.controller'

export function registerHouseholdRoutes(app: FastifyInstance, auth: AuthService, households: HouseholdService, members: MemberService,
  invitations: InvitationService, access: AccessService, requests: MemberRequestService) {
  const controller = householdController(auth, households, members)
  const invite = invitationController(auth, invitations)
  const roles = accessController(auth, access)
  const proposals = memberRequestController(auth, requests)
  const limit = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }
  app.post('/api/household-invitations/redeem', limit, invite.redeem)
  app.post('/api/households', controller.createHousehold)
  app.get('/api/households', controller.listHouseholds)
  app.get('/api/households/:householdId', controller.getHousehold)
  app.patch('/api/households/:householdId', controller.updateHousehold)
  app.get('/api/households/:householdId/members', controller.listMembers)
  app.post('/api/households/:householdId/members', controller.createMember)
  app.get('/api/households/:householdId/members/:memberId', controller.getMember)
  app.patch('/api/households/:householdId/members/:memberId', controller.updateMember)
  app.delete('/api/households/:householdId/members/:memberId', controller.deactivateMember)
  app.patch('/api/households/:householdId/members/:memberId/role', roles.updateRole)
  app.get('/api/households/:householdId/member-requests', proposals.list)
  app.post('/api/households/:householdId/member-requests', proposals.submit)
  app.post('/api/households/:householdId/member-requests/:requestId/approve', proposals.approve)
  app.post('/api/households/:householdId/member-requests/:requestId/reject', proposals.reject)
  app.post('/api/households/:householdId/member-requests/:requestId/cancel', proposals.cancel)
  app.post('/api/households/:householdId/members/:memberId/invitations', limit, invite.generate)
  app.post('/api/households/:householdId/members/:memberId/invitations/:invitationId/regenerate', limit, invite.regenerate)
  app.delete('/api/households/:householdId/members/:memberId/invitations/:invitationId', invite.revoke)
}
