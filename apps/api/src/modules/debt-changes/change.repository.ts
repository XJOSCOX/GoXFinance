import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { DebtChangeRequest } from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
import { debtChangeAudit, debtChangeRequests, debts, users } from '../../../../../packages/db/src/schema'

export function changeRepository(db: DatabaseConnection) {
  const key = (householdId: string, id: string) => and(eq(debtChangeRequests.householdId, householdId), eq(debtChangeRequests.id, id))
  return {
    transaction<T>(operation: () => T) { return db.transaction(operation, { behavior: 'immediate' }) },
    list(householdId: string): DebtChangeRequest[] {
      return db.select({ request: debtChangeRequests, proposedByName: users.fullName, creditorName: debts.creditorName })
        .from(debtChangeRequests).innerJoin(users, eq(users.id, debtChangeRequests.proposedByUserId))
        .innerJoin(debts, eq(debts.id, debtChangeRequests.debtId)).where(eq(debtChangeRequests.householdId, householdId))
        .orderBy(desc(debtChangeRequests.createdAt)).all().map(({ request, proposedByName, creditorName }) => ({
          id: request.id, householdId: request.householdId, debtId: request.debtId, paymentId: request.paymentId,
          proposedByUserId: request.proposedByUserId, action: request.action, reason: request.reason, status: request.status,
          reviewNote: request.reviewNote, reviewedByUserId: request.reviewedByUserId, reviewedAt: request.reviewedAt,
          createdAt: request.createdAt, updatedAt: request.updatedAt, proposedByName, creditorName,
          proposedChanges: JSON.parse(request.payloadJson), originalValues: JSON.parse(request.originalJson),
        })) as DebtChangeRequest[]
    },
    find(householdId: string, id: string) { return db.select().from(debtChangeRequests).where(key(householdId, id)).get() },
    findKey(householdId: string, userId: string, idempotencyKey: string) {
      return db.select().from(debtChangeRequests).where(and(eq(debtChangeRequests.householdId, householdId),
        eq(debtChangeRequests.proposedByUserId, userId), eq(debtChangeRequests.idempotencyKey, idempotencyKey))).get()
    },
    submit(values: typeof debtChangeRequests.$inferInsert) {
      db.insert(debtChangeRequests).values(values).run()
      this.audit(values.id, values.proposedByUserId, 'submitted')
    },
    audit(requestId: string, actorUserId: string, action: 'submitted' | 'approved' | 'rejected' | 'cancelled') {
      db.insert(debtChangeAudit).values({ id: randomUUID(), requestId, actorUserId, action, createdAt: new Date().toISOString() }).run()
    },
    finish(householdId: string, id: string, actorUserId: string, status: 'approved' | 'rejected' | 'cancelled', reviewNote: string | null) {
      const now = new Date().toISOString()
      const updated = db.update(debtChangeRequests).set({ status, activeTarget: null, reviewedByUserId: actorUserId,
        reviewedAt: now, updatedAt: now, reviewNote }).where(and(key(householdId, id), eq(debtChangeRequests.status, 'pending'))).run()
      if (updated.changes !== 1) throw new Error('Request changed during review')
      this.audit(id, actorUserId, status)
    },
  }
}
export type ChangeRepository = ReturnType<typeof changeRepository>
