import { randomUUID } from 'node:crypto'
import { and, eq, asc } from 'drizzle-orm'
import { financialGoals, goalContributions, goalAudit } from '../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../db/connection'
export function goalRepository(db: DatabaseConnection) {
  return {
    atomic<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    goals(home: string) {
      return db.select().from(financialGoals).where(eq(financialGoals.householdId, home)).all()
    },
    contributions(home: string) {
      return db
        .select()
        .from(goalContributions)
        .where(eq(goalContributions.householdId, home))
        .all()
    },
    writeGoal(row: typeof financialGoals.$inferInsert, update: boolean) {
      if (update)
        db.update(financialGoals)
          .set(row)
          .where(
            and(eq(financialGoals.householdId, row.householdId), eq(financialGoals.id, row.id)),
          )
          .run()
      else db.insert(financialGoals).values(row).run()
    },
    writeContribution(row: typeof goalContributions.$inferInsert, update: boolean) {
      if (update)
        db.update(goalContributions)
          .set(row)
          .where(
            and(
              eq(goalContributions.householdId, row.householdId),
              eq(goalContributions.id, row.id),
            ),
          )
          .run()
      else db.insert(goalContributions).values(row).run()
    },
    audit(
      home: string,
      actor: string,
      action: string,
      targetId: string,
      before: unknown,
      record: unknown,
      input: unknown,
    ) {
      db.insert(goalAudit)
        .values({
          id: randomUUID(),
          householdId: home,
          actorUserId: actor,
          action,
          targetId,
          beforeJson: before == null ? null : JSON.stringify(before),
          afterJson: JSON.stringify({ record, input }),
          createdAt: new Date().toISOString(),
        })
        .run()
    },
    history(home: string, id: string) {
      return db
        .select()
        .from(goalAudit)
        .where(and(eq(goalAudit.householdId, home), eq(goalAudit.targetId, id)))
        .orderBy(asc(goalAudit.createdAt))
        .all()
    },
  }
}
export type GoalRepository = ReturnType<typeof goalRepository>
