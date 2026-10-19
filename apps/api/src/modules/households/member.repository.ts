import { and, eq } from 'drizzle-orm'
import type { DatabaseConnection } from '../../db/connection'
import { householdMembers, householdUserRoles } from '../../../../../packages/db/src/schema'

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
  }
}

export type MemberRepository = ReturnType<typeof memberRepository>
