import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { InvitationRole, Relationship } from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
import { householdAudit, householdMemberRequests, householdMembers, users } from '../../../../../packages/db/src/schema'

export function memberRequestRepository(db: DatabaseConnection) {
  return {
    list(householdId: string) {
      return db.select({ request: householdMemberRequests, proposedByName: users.fullName })
        .from(householdMemberRequests).innerJoin(users, eq(householdMemberRequests.proposedByUserId, users.id))
        .where(eq(householdMemberRequests.householdId, householdId)).all()
        .map(({ request, proposedByName }) => ({ ...request, proposedByName }))
    },
    find(householdId: string, requestId: string) {
      return db.select().from(householdMemberRequests).where(and(eq(householdMemberRequests.householdId, householdId),
        eq(householdMemberRequests.id, requestId))).get()
    },
    findRepeat(householdId: string, actorUserId: string, fullName: string, relationship: Relationship) {
      return db.select({ id: householdMemberRequests.id }).from(householdMemberRequests).where(and(
        eq(householdMemberRequests.householdId, householdId), eq(householdMemberRequests.proposedByUserId, actorUserId),
        sql`lower(${householdMemberRequests.fullName}) = lower(${fullName})`, eq(householdMemberRequests.relationship, relationship),
        inArray(householdMemberRequests.status, ['pending', 'approved']))).get()
    },
    findExistingMember(householdId: string, fullName: string, relationship: Relationship) {
      return db.select({ id: householdMembers.id }).from(householdMembers).where(and(
        eq(householdMembers.householdId, householdId), sql`lower(${householdMembers.fullName}) = lower(${fullName})`,
        eq(householdMembers.relationship, relationship), eq(householdMembers.status, 'active'))).get()
    },
    submit(householdId: string, actorUserId: string, values: { fullName: string; relationship: Relationship; notes?: string | null }) {
      const now = new Date().toISOString()
      const requestId = randomUUID()
      const created = db.transaction(tx => {
        const repeated = tx.select({ id: householdMemberRequests.id }).from(householdMemberRequests).where(and(
          eq(householdMemberRequests.householdId, householdId), eq(householdMemberRequests.proposedByUserId, actorUserId),
          sql`lower(${householdMemberRequests.fullName}) = lower(${values.fullName})`,
          eq(householdMemberRequests.relationship, values.relationship),
          inArray(householdMemberRequests.status, ['pending', 'approved']))).get()
        const existing = tx.select({ id: householdMembers.id }).from(householdMembers).where(and(
          eq(householdMembers.householdId, householdId), sql`lower(${householdMembers.fullName}) = lower(${values.fullName})`,
          eq(householdMembers.relationship, values.relationship), eq(householdMembers.status, 'active'))).get()
        if (repeated || existing) return false
        tx.insert(householdMemberRequests).values({ id: requestId, householdId, proposedByUserId: actorUserId,
          fullName: values.fullName, relationship: values.relationship, notes: values.notes ?? null,
          status: 'pending', createdAt: now, updatedAt: now }).run()
        tx.insert(householdAudit).values({ id: randomUUID(), householdId, targetRequestId: requestId,
          actorUserId, action: 'request_submitted', createdAt: now }).run()
        return true
      })
      return created ? this.find(householdId, requestId)! : null
    },
    review(householdId: string, requestId: string, actorUserId: string, action: 'approved' | 'rejected', role: InvitationRole = 'viewer') {
      const now = new Date().toISOString()
      return db.transaction(tx => {
        const request = tx.select().from(householdMemberRequests).where(and(
          eq(householdMemberRequests.householdId, householdId), eq(householdMemberRequests.id, requestId),
          eq(householdMemberRequests.status, 'pending'))).get()
        if (!request) return null
        if (action === 'approved' && tx.select({ id: householdMembers.id }).from(householdMembers).where(and(
          eq(householdMembers.householdId, householdId), sql`lower(${householdMembers.fullName}) = lower(${request.fullName})`,
          eq(householdMembers.relationship, request.relationship), eq(householdMembers.status, 'active'))).get()) return null
        const changed = tx.update(householdMemberRequests).set({ status: action, reviewedByUserId: actorUserId,
          reviewedAt: now, updatedAt: now }).where(and(eq(householdMemberRequests.householdId, householdId),
          eq(householdMemberRequests.id, requestId), eq(householdMemberRequests.status, 'pending'))).run()
        if (changed.changes !== 1) return null
        const memberId = action === 'approved' ? randomUUID() : null
        if (memberId) tx.insert(householdMembers).values({ id: memberId, householdId, linkedUserId: null,
          fullName: request.fullName, relationship: request.relationship, status: 'active',
          plannedAccessRole: role, notes: request.notes, createdAt: now, updatedAt: now }).run()
        tx.insert(householdAudit).values({ id: randomUUID(), householdId, targetRequestId: requestId,
          targetMemberId: memberId, actorUserId, action: action === 'approved' ? 'request_approved' : 'request_rejected',
          newRole: memberId ? role : null, createdAt: now }).run()
        return { memberId }
      })
    },
    cancel(householdId: string, requestId: string, actorUserId: string) {
      const now = new Date().toISOString()
      return db.transaction(tx => {
        const changed = tx.update(householdMemberRequests).set({ status: 'cancelled', updatedAt: now })
          .where(and(eq(householdMemberRequests.householdId, householdId), eq(householdMemberRequests.id, requestId),
            eq(householdMemberRequests.status, 'pending'), eq(householdMemberRequests.proposedByUserId, actorUserId))).run()
        if (changed.changes !== 1) return false
        tx.insert(householdAudit).values({ id: randomUUID(), householdId, targetRequestId: requestId,
          actorUserId, action: 'request_cancelled', createdAt: now }).run()
        return true
      })
    },
  }
}
export type MemberRequestRepository = ReturnType<typeof memberRequestRepository>
