import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import {
  bankReconciliations,
  bankReviewRequests,
  bankTransactions,
  bankMerchantRules,
  bankTransfers,
  bankTransferLegs,
  bankRefunds,
  bankRefundAllocations,
  bankRefundMembers,
} from '../../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../../db/connection'
export function reviewRepository(db: DatabaseConnection) {
  return {
    links(home: string) {
      return db
        .select()
        .from(bankReconciliations)
        .where(eq(bankReconciliations.householdId, home))
        .all()
    },
    link(row: typeof bankReconciliations.$inferInsert) {
      db.insert(bankReconciliations).values(row).run()
    },
    patchLink(home: string, id: string, values: Partial<typeof bankReconciliations.$inferInsert>) {
      db.update(bankReconciliations)
        .set(values)
        .where(and(eq(bankReconciliations.householdId, home), eq(bankReconciliations.id, id)))
        .run()
    },
    requests(home: string) {
      return db
        .select()
        .from(bankReviewRequests)
        .where(eq(bankReviewRequests.householdId, home))
        .all()
    },
    request(row: typeof bankReviewRequests.$inferInsert) {
      db.insert(bankReviewRequests).values(row).run()
    },
    patchRequest(
      home: string,
      id: string,
      values: Partial<typeof bankReviewRequests.$inferInsert>,
    ) {
      db.update(bankReviewRequests)
        .set(values)
        .where(and(eq(bankReviewRequests.householdId, home), eq(bankReviewRequests.id, id)))
        .run()
    },
    transaction(home: string, id: string, values: Partial<typeof bankTransactions.$inferInsert>) {
      db.update(bankTransactions)
        .set(values)
        .where(and(eq(bankTransactions.householdId, home), eq(bankTransactions.id, id)))
        .run()
    },
    rules(home: string) {
      return db
        .select()
        .from(bankMerchantRules)
        .where(eq(bankMerchantRules.householdId, home))
        .all()
    },
    rule(row: typeof bankMerchantRules.$inferInsert) {
      db.insert(bankMerchantRules)
        .values(row)
        .onConflictDoUpdate({
          target: [bankMerchantRules.accountId, bankMerchantRules.merchant],
          set: {
            classification: row.classification,
            categoryId: row.categoryId,
            createdByUserId: row.createdByUserId,
            updatedAt: row.updatedAt,
          },
        })
        .run()
    },
    transfer(home: string, actor: string) {
      const row = {
        id: randomUUID(),
        householdId: home,
        createdByUserId: actor,
        createdAt: new Date().toISOString(),
      }
      db.insert(bankTransfers).values(row).run()
      return row
    },
    legs(home: string) {
      return db.select().from(bankTransferLegs).where(eq(bankTransferLegs.householdId, home)).all()
    },
    leg(row: typeof bankTransferLegs.$inferInsert) {
      db.insert(bankTransferLegs).values(row).run()
    },
    refunds(home: string) {
      const allocations = db
        .select()
        .from(bankRefundAllocations)
        .where(eq(bankRefundAllocations.householdId, home))
        .all()
      return db
        .select()
        .from(bankRefunds)
        .where(eq(bankRefunds.householdId, home))
        .all()
        .map((r) => ({ ...r, allocations: allocations.filter((a) => a.refundId === r.id) }))
    },
    refund(
      row: typeof bankRefunds.$inferInsert,
      allocations: { categoryId: string; amountCents: number }[],
      members: string[],
    ) {
      db.insert(bankRefunds).values(row).run()
      for (const a of allocations)
        db.insert(bankRefundAllocations)
          .values({ ...a, id: randomUUID(), householdId: row.householdId, refundId: row.id })
          .run()
      for (const memberId of new Set(members))
        db.insert(bankRefundMembers)
          .values({ id: randomUUID(), householdId: row.householdId, refundId: row.id, memberId })
          .run()
    },
    patchRefund(home: string, id: string, values: Partial<typeof bankRefunds.$inferInsert>) {
      db.update(bankRefunds)
        .set(values)
        .where(and(eq(bankRefunds.householdId, home), eq(bankRefunds.id, id)))
        .run()
    },
    refundAllocations(
      home: string,
      id: string,
      allocations: { categoryId: string; amountCents: number }[],
    ) {
      db.delete(bankRefundAllocations)
        .where(
          and(eq(bankRefundAllocations.householdId, home), eq(bankRefundAllocations.refundId, id)),
        )
        .run()
      for (const a of allocations)
        db.insert(bankRefundAllocations)
          .values({ ...a, id: randomUUID(), householdId: home, refundId: id })
          .run()
    },
  }
}
export type ReviewRepository = ReturnType<typeof reviewRepository>
