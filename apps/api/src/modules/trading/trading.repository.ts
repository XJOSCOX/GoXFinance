import { randomUUID } from 'node:crypto'
import { and, eq, asc } from 'drizzle-orm'
import {
  tradingAccounts,
  tradingResults,
  tradingPayouts,
  tradingAudit,
  tradingRuleSnapshots,
  copyEventResults,
  copyEvents,
  copyGroupMembers,
  financialGoals,
} from '../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../db/connection'
export function tradingRepository(db: DatabaseConnection) {
  return {
    atomic<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    accounts(home: string) {
      return db.select().from(tradingAccounts).where(eq(tradingAccounts.householdId, home)).all()
    },
    results(home: string) {
      return db.select().from(tradingResults).where(eq(tradingResults.householdId, home)).all()
    },
    payouts(home: string) {
      return db.select().from(tradingPayouts).where(eq(tradingPayouts.householdId, home)).all()
    },
    rules(home: string, account: string) {
      return db
        .select()
        .from(tradingRuleSnapshots)
        .where(
          and(
            eq(tradingRuleSnapshots.householdId, home),
            eq(tradingRuleSnapshots.accountId, account),
          ),
        )
        .orderBy(asc(tradingRuleSnapshots.createdAt), asc(tradingRuleSnapshots.id))
        .all()
    },
    copyResults(home: string) {
      return db
        .select({ row: copyEventResults, event: copyEvents })
        .from(copyEventResults)
        .innerJoin(
          copyEvents,
          and(
            eq(copyEvents.id, copyEventResults.eventId),
            eq(copyEvents.householdId, copyEventResults.householdId),
          ),
        )
        .where(eq(copyEventResults.householdId, home))
        .all()
    },
    writeAccount(values: typeof tradingAccounts.$inferInsert, update = false) {
      if (update)
        db.update(tradingAccounts)
          .set(values)
          .where(
            and(
              eq(tradingAccounts.householdId, values.householdId),
              eq(tradingAccounts.id, values.id),
            ),
          )
          .run()
      else db.insert(tradingAccounts).values(values).run()
    },
    hasAccountHistory(home: string, id: string) {
      return !!(
        db
          .select()
          .from(tradingResults)
          .where(and(eq(tradingResults.householdId, home), eq(tradingResults.accountId, id)))
          .get() ||
        db
          .select()
          .from(tradingPayouts)
          .where(and(eq(tradingPayouts.householdId, home), eq(tradingPayouts.accountId, id)))
          .get() ||
        db.select().from(copyGroupMembers).where(eq(copyGroupMembers.accountId, id)).get() ||
        db.select().from(copyEventResults).where(eq(copyEventResults.accountId, id)).get() ||
        db.select().from(financialGoals).where(eq(financialGoals.tradingAccountId, id)).get()
      )
    },
    removeAccount(home: string, id: string) {
      db.delete(tradingRuleSnapshots)
        .where(
          and(eq(tradingRuleSnapshots.householdId, home), eq(tradingRuleSnapshots.accountId, id)),
        )
        .run()
      db.delete(tradingAccounts)
        .where(and(eq(tradingAccounts.householdId, home), eq(tradingAccounts.id, id)))
        .run()
    },
    writeResult(values: typeof tradingResults.$inferInsert, update = false) {
      if (update)
        db.update(tradingResults)
          .set(values)
          .where(
            and(
              eq(tradingResults.householdId, values.householdId),
              eq(tradingResults.id, values.id),
            ),
          )
          .run()
      else db.insert(tradingResults).values(values).run()
    },
    writePayout(values: typeof tradingPayouts.$inferInsert, update = false) {
      if (update)
        db.update(tradingPayouts)
          .set(values)
          .where(
            and(
              eq(tradingPayouts.householdId, values.householdId),
              eq(tradingPayouts.id, values.id),
            ),
          )
          .run()
      else db.insert(tradingPayouts).values(values).run()
    },
    addRule(home: string, accountId: string, rules: unknown) {
      db.insert(tradingRuleSnapshots)
        .values({
          id: randomUUID(),
          householdId: home,
          accountId,
          rulesJson: JSON.stringify(rules),
          createdAt: new Date().toISOString(),
        })
        .run()
    },
    audit(
      home: string,
      actor: string,
      action: string,
      targetId: string,
      before: unknown,
      record: unknown,
      input?: unknown,
    ) {
      db.insert(tradingAudit)
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
    history(home: string, target: string) {
      return db
        .select()
        .from(tradingAudit)
        .where(and(eq(tradingAudit.householdId, home), eq(tradingAudit.targetId, target)))
        .orderBy(asc(tradingAudit.createdAt))
        .all()
    },
  }
}
export type TradingRepository = ReturnType<typeof tradingRepository>
export type TradingAccountRow = ReturnType<TradingRepository['accounts']>[number]
