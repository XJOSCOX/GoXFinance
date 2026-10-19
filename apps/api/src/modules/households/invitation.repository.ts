import { and, eq, lte, gt, isNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { DatabaseConnection } from '../../db/connection'
import { householdInvitations, householdMembers, householdUserRoles, users } from '../../../../../packages/db/src/schema'

type NewUser = typeof users.$inferInsert
type NewInvitation = typeof householdInvitations.$inferInsert

export function invitationRepository(db: DatabaseConnection) {
  function expireStale(now: string) {
    db.update(householdInvitations).set({ status: 'expired', activeMemberId: null, updatedAt: now })
      .where(and(eq(householdInvitations.status, 'pending'), lte(householdInvitations.expiresAt, now))).run()
  }

  return {
    listPending(householdId: string) {
      expireStale(new Date().toISOString())
      return db.select().from(householdInvitations)
        .where(and(eq(householdInvitations.householdId, householdId), eq(householdInvitations.status, 'pending'))).all()
    },
    find(householdId: string, memberId: string, invitationId: string) {
      expireStale(new Date().toISOString())
      return db.select().from(householdInvitations).where(and(eq(householdInvitations.id, invitationId),
        eq(householdInvitations.householdId, householdId), eq(householdInvitations.memberId, memberId))).get()
    },
    issue(invitation: NewInvitation) {
      expireStale(invitation.createdAt)
      db.transaction(tx => {
        tx.update(householdInvitations).set({ status: 'revoked', activeMemberId: null,
          revokedAt: invitation.createdAt, updatedAt: invitation.createdAt })
          .where(and(eq(householdInvitations.activeMemberId, invitation.memberId),
            eq(householdInvitations.status, 'pending'))).run()
        tx.insert(householdInvitations).values(invitation).run()
      })
      return this.find(invitation.householdId, invitation.memberId, invitation.id)!
    },
    revoke(householdId: string, memberId: string, invitationId: string, now: string) {
      return db.update(householdInvitations).set({ status: 'revoked', activeMemberId: null, revokedAt: now, updatedAt: now })
        .where(and(eq(householdInvitations.id, invitationId), eq(householdInvitations.householdId, householdId),
          eq(householdInvitations.memberId, memberId), eq(householdInvitations.status, 'pending'))).run().changes === 1
    },
    revokeForMember(householdId: string, memberId: string) {
      const now = new Date().toISOString()
      db.update(householdInvitations).set({ status: 'revoked', activeMemberId: null, revokedAt: now, updatedAt: now })
        .where(and(eq(householdInvitations.householdId, householdId), eq(householdInvitations.memberId, memberId),
          eq(householdInvitations.status, 'pending'))).run()
    },
    redeem(codeHash: string, userId: string, newUser?: NewUser) {
      const now = new Date().toISOString()
      expireStale(now)
      return db.transaction(tx => {
        const invitation = tx.select().from(householdInvitations).where(and(
          eq(householdInvitations.codeHash, codeHash), eq(householdInvitations.status, 'pending'),
          gt(householdInvitations.expiresAt, now))).get()
        if (!invitation) return null
        const member = tx.select().from(householdMembers).where(and(
          eq(householdMembers.id, invitation.memberId), eq(householdMembers.householdId, invitation.householdId),
          eq(householdMembers.status, 'active'), isNull(householdMembers.linkedUserId))).get()
        if (!member) return null
        const existingRole = tx.select().from(householdUserRoles).where(and(
          eq(householdUserRoles.householdId, invitation.householdId), eq(householdUserRoles.userId, userId))).get()
        if (existingRole) return null
        if (newUser) tx.insert(users).values(newUser).run()
        const linked = tx.update(householdMembers).set({ linkedUserId: userId, updatedAt: now })
          .where(and(eq(householdMembers.id, invitation.memberId), isNull(householdMembers.linkedUserId))).run()
        if (linked.changes !== 1) throw new Error('Invitation link conflict')
        tx.insert(householdUserRoles).values({ id: randomUUID(), householdId: invitation.householdId,
          userId, role: invitation.role, createdAt: now, updatedAt: now }).run()
        const claimed = tx.update(householdInvitations).set({ status: 'redeemed', activeMemberId: null,
          redeemedByUserId: userId, redeemedAt: now, updatedAt: now }).where(and(
          eq(householdInvitations.id, invitation.id), eq(householdInvitations.status, 'pending'),
          gt(householdInvitations.expiresAt, now))).run()
        if (claimed.changes !== 1) throw new Error('Invitation claim conflict')
        return { householdId: invitation.householdId, memberId: invitation.memberId, role: invitation.role }
      })
    },
  }
}

export type InvitationRepository = ReturnType<typeof invitationRepository>
