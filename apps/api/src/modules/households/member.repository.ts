import { and, eq } from 'drizzle-orm'
import type { DatabaseConnection } from '../../db/connection'
import { householdInvitations, householdMembers, householdUserRoles } from '../../../../../packages/db/src/schema'

export function memberRepository(db: DatabaseConnection) {
  const columns = {
    id: householdMembers.id,
    householdId: householdMembers.householdId,
    linkedUserId: householdMembers.linkedUserId,
    fullName: householdMembers.fullName,
    relationship: householdMembers.relationship,
    status: householdMembers.status,
    notes: householdMembers.notes,
    createdAt: householdMembers.createdAt,
    updatedAt: householdMembers.updatedAt,
    accessRole: householdUserRoles.role,
  }
  const memberRoleJoin = and(
    eq(householdUserRoles.householdId, householdMembers.householdId),
    eq(householdUserRoles.userId, householdMembers.linkedUserId),
  )

  return {
    list(householdId: string) {
      return db.select(columns).from(householdMembers)
        .leftJoin(householdUserRoles, memberRoleJoin)
        .where(eq(householdMembers.householdId, householdId)).all()
    },
    find(householdId: string, memberId: string) {
      return db.select(columns).from(householdMembers)
        .leftJoin(householdUserRoles, memberRoleJoin)
        .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.id, memberId))).get()
    },
    create(member: typeof householdMembers.$inferInsert) {
      db.insert(householdMembers).values(member).run()
      return this.find(member.householdId, member.id)!
    },
    update(householdId: string, memberId: string, changes: Partial<typeof householdMembers.$inferInsert>) {
      db.update(householdMembers).set({ ...changes, updatedAt: new Date().toISOString() })
        .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.id, memberId))).run()
      return this.find(householdId, memberId)!
    },
    deactivate(householdId: string, memberId: string, changes: Partial<typeof householdMembers.$inferInsert> = {}) {
      const now = new Date().toISOString()
      db.transaction(tx => {
        const member = tx.select().from(householdMembers).where(and(
          eq(householdMembers.householdId, householdId), eq(householdMembers.id, memberId))).get()
        if (!member) throw new Error('Member not found')
        if (member.linkedUserId) tx.delete(householdUserRoles).where(and(
          eq(householdUserRoles.householdId, householdId), eq(householdUserRoles.userId, member.linkedUserId))).run()
        tx.update(householdMembers).set({ ...changes, status: 'inactive', linkedUserId: null, updatedAt: now })
          .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.id, memberId))).run()
        tx.update(householdInvitations).set({ status: 'revoked', activeMemberId: null, revokedAt: now, updatedAt: now })
          .where(and(eq(householdInvitations.householdId, householdId), eq(householdInvitations.memberId, memberId),
            eq(householdInvitations.status, 'pending'))).run()
      })
      return this.find(householdId, memberId)!
    },
  }
}

export type MemberRepository = ReturnType<typeof memberRepository>
