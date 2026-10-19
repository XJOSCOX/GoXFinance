import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import {
  copyGroups,
  copyGroupMembers,
  copyEvents,
  copyEventResults,
  tradingPayoutBatches,
} from '../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../db/connection'
import type { CopyGroupInput } from '@goxfinance/shared'
export function copyRepository(db: DatabaseConnection) {
  return {
    groups(home: string) {
      return db
        .select()
        .from(copyGroups)
        .where(eq(copyGroups.householdId, home))
        .all()
        .map((g) => ({
          ...g,
          members: db
            .select({
              accountId: copyGroupMembers.accountId,
              quantityMultiplier: copyGroupMembers.quantityMultiplier,
            })
            .from(copyGroupMembers)
            .where(and(eq(copyGroupMembers.householdId, home), eq(copyGroupMembers.groupId, g.id)))
            .all(),
        }))
    },
    events(home: string) {
      return db
        .select()
        .from(copyEvents)
        .where(eq(copyEvents.householdId, home))
        .all()
        .map((e) => ({
          ...e,
          membershipSnapshot: JSON.parse(e.membershipJson) as CopyGroupInput,
          entries: db
            .select()
            .from(copyEventResults)
            .where(and(eq(copyEventResults.householdId, home), eq(copyEventResults.eventId, e.id)))
            .all(),
        }))
    },
    writeGroup(
      row: typeof copyGroups.$inferInsert,
      members: CopyGroupInput['members'],
      update: boolean,
    ) {
      if (update) {
        db.update(copyGroups)
          .set(row)
          .where(and(eq(copyGroups.householdId, row.householdId), eq(copyGroups.id, row.id)))
          .run()
        db.delete(copyGroupMembers)
          .where(
            and(
              eq(copyGroupMembers.householdId, row.householdId),
              eq(copyGroupMembers.groupId, row.id),
            ),
          )
          .run()
      } else db.insert(copyGroups).values(row).run()
      for (const member of members)
        db.insert(copyGroupMembers)
          .values({ id: randomUUID(), groupId: row.id, householdId: row.householdId, ...member })
          .run()
    },
    writeEvent(
      row: typeof copyEvents.$inferInsert,
      entries: (typeof copyEventResults.$inferInsert)[],
      update: boolean,
    ) {
      if (update)
        db.update(copyEvents)
          .set(row)
          .where(and(eq(copyEvents.householdId, row.householdId), eq(copyEvents.id, row.id)))
          .run()
      else db.insert(copyEvents).values(row).run()
      for (const entry of entries)
        db.insert(copyEventResults)
          .values(entry)
          .onConflictDoUpdate({
            target: [copyEventResults.eventId, copyEventResults.accountId],
            set: entry,
          })
          .run()
    },
    batches(home: string) {
      return db
        .select()
        .from(tradingPayoutBatches)
        .where(eq(tradingPayoutBatches.householdId, home))
        .all()
    },
    createBatch(row: typeof tradingPayoutBatches.$inferInsert) {
      db.insert(tradingPayoutBatches).values(row).run()
    },
  }
}
export type CopyRepository = ReturnType<typeof copyRepository>
