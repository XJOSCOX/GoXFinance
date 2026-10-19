import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.service'
import { householdController } from './household.controller'
import type { HouseholdService } from './household.service'
import type { MemberService } from './member.service'

export function registerHouseholdRoutes(app: FastifyInstance, auth: AuthService, households: HouseholdService, members: MemberService) {
  const controller = householdController(auth, households, members)
  app.post('/api/households', controller.createHousehold)
  app.get('/api/households', controller.listHouseholds)
  app.get('/api/households/:householdId', controller.getHousehold)
  app.patch('/api/households/:householdId', controller.updateHousehold)
  app.get('/api/households/:householdId/members', controller.listMembers)
  app.post('/api/households/:householdId/members', controller.createMember)
  app.get('/api/households/:householdId/members/:memberId', controller.getMember)
  app.patch('/api/households/:householdId/members/:memberId', controller.updateMember)
  app.delete('/api/households/:householdId/members/:memberId', controller.deactivateMember)
}
