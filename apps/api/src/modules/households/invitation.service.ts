import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createInvitationSchema, invitationCodeSchema, redeemInvitationSchema, type InvitationSummary, type PublicUser } from '@goxfinance/shared'
import type { users } from '../../../../../packages/db/src/schema'
import type { HouseholdRepository } from './household.repository'
import type { MemberRepository } from './member.repository'
import type { InvitationRepository } from './invitation.repository'
import { HouseholdError, requireHouseholdRole } from './household.permissions'

const INVALID_CODE = 'Invitation could not be accepted'
const EXPIRY_DAYS = 7

export class InvitationError extends Error {
  constructor(message = INVALID_CODE, public statusCode = 400, public code = 'INVITATION_INVALID') { super(message) }
}

export function invitationCodeHash(code: string) {
  return createHash('sha256').update(code).digest('hex')
}

export function invitationService(households: HouseholdRepository, members: MemberRepository, invitations: InvitationRepository) {
  function verifyTarget(user: PublicUser, householdId: string, memberId: string) {
    requireHouseholdRole(households, householdId, user.id, 'manageRoles')
    const member = members.find(householdId, memberId)
    if (!member) throw new HouseholdError('Member not found', 404)
    if (member.status !== 'active' || member.linkedUserId) throw new HouseholdError('This member cannot be invited', 409)
    return member
  }

  function summary(row: { id: string; memberId: string; role: 'admin' | 'editor' | 'viewer'; status: InvitationSummary['status']; createdAt: string; expiresAt: string }): InvitationSummary {
    return { id: row.id, memberId: row.memberId, role: row.role, status: row.status, createdAt: row.createdAt, expiresAt: row.expiresAt }
  }

  function issue(user: PublicUser, householdId: string, memberId: string) {
    const member = verifyTarget(user, householdId, memberId)
    const code = randomBytes(32).toString('base64url')
    const now = new Date()
    const row = invitations.issue({ id: randomUUID(), householdId, memberId, activeMemberId: memberId,
      codeHash: invitationCodeHash(code), role: member.plannedAccessRole, status: 'pending', createdByUserId: user.id,
      createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + EXPIRY_DAYS * 86400000).toISOString() })
    return { invitation: summary(row), code }
  }

  function redeem(code: string, userId: string, newUser?: typeof users.$inferInsert) {
    const parsed = invitationCodeSchema.safeParse(code)
    if (!parsed.success) throw new InvitationError()
    try {
      const result = invitations.redeem(invitationCodeHash(parsed.data), userId, newUser)
      if (!result) throw new InvitationError()
      return result
    } catch (error) {
      if (error instanceof InvitationError) throw error
      throw new InvitationError()
    }
  }

  return {
    listPending: (householdId: string) => invitations.listPending(householdId).map(summary),
    generate(user: PublicUser, householdId: string, memberId: string, input: unknown) {
      const { role } = createInvitationSchema.parse(input ?? {})
      const member = verifyTarget(user, householdId, memberId)
      if (role && role !== member.plannedAccessRole) throw new HouseholdError('Change planned access before inviting', 409)
      return issue(user, householdId, memberId)
    },
    regenerate(user: PublicUser, householdId: string, memberId: string, invitationId: string) {
      verifyTarget(user, householdId, memberId)
      const before = invitations.find(householdId, memberId, invitationId)
      if (!before || before.status !== 'pending') throw new HouseholdError('Invitation is no longer active', 409)
      return issue(user, householdId, memberId)
    },
    revoke(user: PublicUser, householdId: string, memberId: string, invitationId: string) {
      verifyTarget(user, householdId, memberId)
      const revoked = invitations.revoke(householdId, memberId, invitationId, new Date().toISOString())
      if (!revoked) throw new HouseholdError('Invitation is no longer active', 409)
    },
    redeemForUser(user: PublicUser, input: unknown) {
      const parsed = redeemInvitationSchema.safeParse(input)
      if (!parsed.success) throw new InvitationError()
      return redeem(parsed.data.code, user.id)
    },
    redeemForSignup: redeem,
  }
}

export type InvitationService = ReturnType<typeof invitationService>
