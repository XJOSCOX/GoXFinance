import { and, eq } from 'drizzle-orm'
import {
  bankAccounts,
  bankAccountMembers,
  bankConnections,
  bankTransactions,
  plaidLinkAttempts,
} from '../../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../../db/connection'
export function plaidRepository(db: DatabaseConnection) {
  return {
    hasDifferentKey(keyId: string) {
      return db
        .select({ keyId: bankConnections.tokenKeyId })
        .from(bankConnections)
        .all()
        .some((r) => r.keyId !== null && r.keyId !== keyId)
    },
    attempts() {
      return db.select().from(plaidLinkAttempts).all()
    },
    attempt(row: typeof plaidLinkAttempts.$inferInsert) {
      db.insert(plaidLinkAttempts).values(row).run()
    },
    patchAttempt(home: string, id: string, values: Partial<typeof plaidLinkAttempts.$inferInsert>) {
      db.update(plaidLinkAttempts)
        .set(values)
        .where(and(eq(plaidLinkAttempts.householdId, home), eq(plaidLinkAttempts.id, id)))
        .run()
    },
    connection(row: typeof bankConnections.$inferInsert) {
      db.insert(bankConnections).values(row).run()
    },
    patchConnection(
      home: string,
      id: string,
      values: Partial<typeof bankConnections.$inferInsert>,
    ) {
      db.update(bankConnections)
        .set(values)
        .where(and(eq(bankConnections.householdId, home), eq(bankConnections.id, id)))
        .run()
    },
    account(row: typeof bankAccounts.$inferInsert, memberId: string) {
      db.insert(bankAccounts).values(row).run()
      db.insert(bankAccountMembers)
        .values({
          id: crypto.randomUUID(),
          householdId: row.householdId,
          accountId: row.id,
          memberId,
        })
        .run()
    },
    patchAccount(home: string, id: string, values: Partial<typeof bankAccounts.$inferInsert>) {
      db.update(bankAccounts)
        .set(values)
        .where(and(eq(bankAccounts.householdId, home), eq(bankAccounts.id, id)))
        .run()
    },
    transaction(row: typeof bankTransactions.$inferInsert) {
      db.insert(bankTransactions).values(row).run()
    },
    patchTransaction(
      home: string,
      id: string,
      values: Partial<typeof bankTransactions.$inferInsert>,
    ) {
      db.update(bankTransactions)
        .set(values)
        .where(and(eq(bankTransactions.householdId, home), eq(bankTransactions.id, id)))
        .run()
    },
  }
}
export type PlaidRepository = ReturnType<typeof plaidRepository>
