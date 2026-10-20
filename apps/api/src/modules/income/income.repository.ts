import { randomUUID } from 'node:crypto'
import { guardBankReference } from '../../db/financial-reference-guard'
import { and, eq, asc } from 'drizzle-orm'
import {
  incomeSources,
  incomeTransactions,
  incomeAudit,
} from '../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../db/connection'
import type { IncomeSourceInput } from '@goxfinance/shared'
export function incomeRepository(db: DatabaseConnection) {
  const sourceKey = (home: string, id: string) =>
    and(eq(incomeSources.householdId, home), eq(incomeSources.id, id))
  const transactionKey = (home: string, id: string) =>
    and(eq(incomeTransactions.householdId, home), eq(incomeTransactions.id, id))
  return {
    atomic<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    sources(home: string) {
      return db.select().from(incomeSources).where(eq(incomeSources.householdId, home)).all()
    },
    transactions(home: string) {
      return db
        .select()
        .from(incomeTransactions)
        .where(eq(incomeTransactions.householdId, home))
        .all()
    },
    source(home: string, id: string) {
      return db.select().from(incomeSources).where(sourceKey(home, id)).get()
    },
    transaction(home: string, id: string) {
      return db.select().from(incomeTransactions).where(transactionKey(home, id)).get()
    },
    sourceKey(home: string, key: string) {
      return db
        .select()
        .from(incomeSources)
        .where(and(eq(incomeSources.householdId, home), eq(incomeSources.idempotencyKey, key)))
        .get()
    },
    transactionSubmission(home: string, key: string) {
      return db
        .select()
        .from(incomeTransactions)
        .where(
          and(eq(incomeTransactions.householdId, home), eq(incomeTransactions.idempotencyKey, key)),
        )
        .get()
    },
    createSource(home: string, actor: string, key: string, values: IncomeSourceInput) {
      const now = new Date().toISOString(),
        id = randomUUID()
      db.insert(incomeSources)
        .values({
          ...values,
          id,
          householdId: home,
          createdByUserId: actor,
          idempotencyKey: key,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      return this.source(home, id)!
    },
    updateSource(
      home: string,
      id: string,
      revision: number,
      values: Partial<IncomeSourceInput> & { isArchived?: boolean },
    ) {
      db.update(incomeSources)
        .set({ ...values, revision: revision + 1, updatedAt: new Date().toISOString() })
        .where(and(sourceKey(home, id), eq(incomeSources.revision, revision)))
        .run()
      return this.source(home, id)!
    },
    createTransaction(
      home: string,
      actor: string,
      key: string,
      values: typeof incomeTransactions.$inferInsert,
    ) {
      db.insert(incomeTransactions)
        .values({ ...values, householdId: home, createdByUserId: actor, idempotencyKey: key })
        .run()
      return this.transaction(home, values.id)!
    },
    updateTransaction(
      home: string,
      id: string,
      revision: number,
      values: Partial<typeof incomeTransactions.$inferInsert>,
    ) {
      guardBankReference(db, home, 'incomeId', id)
      db.update(incomeTransactions)
        .set({ ...values, revision: revision + 1, updatedAt: new Date().toISOString() })
        .where(and(transactionKey(home, id), eq(incomeTransactions.revision, revision)))
        .run()
      return this.transaction(home, id)!
    },
    audit(
      home: string,
      sourceId: string,
      transactionId: string | null,
      actor: string,
      action: string,
      before: unknown,
      after: unknown,
      reason?: string,
    ) {
      db.insert(incomeAudit)
        .values({
          id: randomUUID(),
          householdId: home,
          sourceId,
          transactionId,
          actorUserId: actor,
          action,
          beforeJson: before == null ? null : JSON.stringify(before),
          afterJson: JSON.stringify({ record: after, reason: reason ?? null }),
          createdAt: new Date().toISOString(),
        })
        .run()
    },
    history(home: string, sourceId: string) {
      return db
        .select()
        .from(incomeAudit)
        .where(and(eq(incomeAudit.householdId, home), eq(incomeAudit.sourceId, sourceId)))
        .orderBy(asc(incomeAudit.createdAt))
        .all()
    },
  }
}
export type IncomeRepository = ReturnType<typeof incomeRepository>
export type SourceRow = NonNullable<ReturnType<IncomeRepository['source']>>
export type TransactionRow = NonNullable<ReturnType<IncomeRepository['transaction']>>
