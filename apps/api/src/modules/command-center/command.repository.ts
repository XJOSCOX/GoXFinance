import { and, eq, desc } from 'drizzle-orm'
import { commandPreferences } from '../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../db/connection'
export function commandRepository(db: DatabaseConnection) {
  return {
    atomic<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    latest(home: string, actor: string) {
      return db
        .select()
        .from(commandPreferences)
        .where(
          and(eq(commandPreferences.householdId, home), eq(commandPreferences.actorUserId, actor)),
        )
        .orderBy(desc(commandPreferences.revision))
        .limit(1)
        .get()
    },
    replay(home: string, actor: string, key: string) {
      return db
        .select()
        .from(commandPreferences)
        .where(
          and(
            eq(commandPreferences.householdId, home),
            eq(commandPreferences.actorUserId, actor),
            eq(commandPreferences.idempotencyKey, key),
          ),
        )
        .get()
    },
    save(row: typeof commandPreferences.$inferInsert) {
      db.insert(commandPreferences).values(row).run()
    },
  }
}
export type CommandRepository = ReturnType<typeof commandRepository>
