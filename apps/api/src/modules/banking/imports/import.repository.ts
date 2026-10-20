import { eq, and, asc } from 'drizzle-orm'
import {
  bankImportBatches,
  bankTransactions,
  bankReviewRequests,
  bankReconciliations,
  bankMerchantRules,
  bankTransferLegs,
} from '../../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../../db/connection'
export function importRepository(db: DatabaseConnection) {
  return {
    legs(home: string) {
      return db.select().from(bankTransferLegs).where(eq(bankTransferLegs.householdId, home)).all()
    },
    batches(home: string) {
      return db
        .select()
        .from(bankImportBatches)
        .where(eq(bankImportBatches.householdId, home))
        .all()
    },
    batch(row: typeof bankImportBatches.$inferInsert) {
      db.insert(bankImportBatches).values(row).run()
    },
    transaction(row: typeof bankTransactions.$inferInsert) {
      db.insert(bankTransactions).values(row).run()
    },
    requests(home: string) {
      return db
        .select()
        .from(bankReviewRequests)
        .where(eq(bankReviewRequests.householdId, home))
        .orderBy(asc(bankReviewRequests.createdAt), asc(bankReviewRequests.id))
        .all()
    },
    links(home: string) {
      return db
        .select()
        .from(bankReconciliations)
        .where(eq(bankReconciliations.householdId, home))
        .all()
    },
    rules(home: string, account: string) {
      return db
        .select()
        .from(bankMerchantRules)
        .where(
          and(eq(bankMerchantRules.householdId, home), eq(bankMerchantRules.accountId, account)),
        )
        .all()
    },
  }
}
export type ImportRepository = ReturnType<typeof importRepository>
