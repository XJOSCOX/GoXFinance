import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { InvitationRole } from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
import { householdAudit, householdInvitations, householdMembers, householdUserRoles } from '../../../../../packages/db/src/schema'

export function accessRepository(db: DatabaseConnection) {
  return {
    changePlanned(householdId: string, memberId: string, actorUserId: string, previousRole: InvitationRole, newRole: InvitationRole) {
      const now = new Date().toISOString()
      db.transaction(tx => {
        const changed = tx.update(householdMembers).set({ plannedAccessRole: newRole, updatedAt: now })
          .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.id, memberId),
            eq(householdMembers.plannedAccessRole, previousRole), eq(householdMembers.status, 'active'),
            isNull(householdMembers.linkedUserId))).run()
        if (changed.changes !== 1) throw new Error('Member changed during access update')
        tx.update(householdInvitations).set({ status: 'revoked', activeMemberId: null, revokedAt: now, updatedAt: now })
          .where(and(eq(householdInvitations.householdId, householdId), eq(householdInvitations.memberId, memberId),
            eq(householdInvitations.status, 'pending'))).run()
        tx.insert(householdAudit).values({ id: randomUUID(), householdId, targetMemberId: memberId, actorUserId,
          action: 'planned_role_changed', previousRole, newRole, createdAt: now }).run()
      })
    },
    changeActive(householdId: string, memberId: string, linkedUserId: string, actorUserId: string,
      previousRole: InvitationRole, newRole: InvitationRole) {
      const now = new Date().toISOString()
      db.transaction(tx => {
        const changed = tx.update(householdUserRoles).set({ role: newRole, updatedAt: now })
          .where(and(eq(householdUserRoles.householdId, householdId), eq(householdUserRoles.userId, linkedUserId),
            eq(householdUserRoles.role, previousRole))).run()
        if (changed.changes !== 1) throw new Error('Role changed during access update')
        tx.insert(householdAudit).values({ id: randomUUID(), householdId, targetMemberId: memberId, actorUserId,
          action: 'role_changed', previousRole, newRole, createdAt: now }).run()
      })
    },
  }
}
export type AccessRepository = ReturnType<typeof accessRepository>
