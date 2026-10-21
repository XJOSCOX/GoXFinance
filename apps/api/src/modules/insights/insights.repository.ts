import { and, eq } from 'drizzle-orm'
import { insightRecords, insightAudit } from '../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../db/connection'
export function insightsRepository(db: DatabaseConnection) {
  return {
    atomic<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    records(home: string, actor: string) {
      return db
        .select()
        .from(insightRecords)
        .where(and(eq(insightRecords.householdId, home), eq(insightRecords.actorUserId, actor)))
        .all()
    },
    audit(home: string, actor: string) {
      return db
        .select()
        .from(insightAudit)
        .where(and(eq(insightAudit.householdId, home), eq(insightAudit.actorUserId, actor)))
        .all()
    },
    write(row: typeof insightRecords.$inferInsert) {
      db.insert(insightRecords)
        .values(row)
        .onConflictDoUpdate({
          target: [
            insightRecords.householdId,
            insightRecords.actorUserId,
            insightRecords.insightId,
            insightRecords.kind,
          ],
          set: {
            revision: row.revision,
            valuesJson: row.valuesJson,
            snapshotJson: row.snapshotJson,
            fingerprint: row.fingerprint,
            updatedAt: row.updatedAt,
          },
        })
        .run()
    },
    recordAudit(row: typeof insightAudit.$inferInsert) {
      db.insert(insightAudit).values(row).run()
    },
  }
}
export type InsightsRepository = ReturnType<typeof insightsRepository>
