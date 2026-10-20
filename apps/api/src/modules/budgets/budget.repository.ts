import { randomUUID } from 'node:crypto'
import { and, eq, asc } from 'drizzle-orm'
import {
  budgetMonths,
  budgetCategoryLimits,
  budgetAudit,
} from '../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../db/connection'
import type { BudgetInput } from '@goxfinance/shared'
export function budgetRepository(db: DatabaseConnection) {
  const key = (home: string, id: string) =>
    and(eq(budgetMonths.householdId, home), eq(budgetMonths.id, id))
  function all(home: string) {
    const limits = db
      .select()
      .from(budgetCategoryLimits)
      .where(eq(budgetCategoryLimits.householdId, home))
      .all()
    return db
      .select()
      .from(budgetMonths)
      .where(eq(budgetMonths.householdId, home))
      .all()
      .map((r) => ({
        ...r,
        limits: limits
          .filter((l) => l.budgetId === r.id)
          .map((l) => ({ categoryId: l.categoryId, amountCents: l.amountCents })),
      }))
  }
  return {
    all,
    atomic<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    write(
      home: string,
      actor: string,
      v: BudgetInput,
      idempotencyKey: string,
      old?: ReturnType<typeof all>[number],
    ) {
      const now = new Date().toISOString(),
        id = old?.id ?? randomUUID(),
        row = {
          ...v,
          id,
          householdId: home,
          scopeKey: v.responsibleMemberId ?? 'household',
          createdByUserId: old?.createdByUserId ?? actor,
          idempotencyKey: old?.idempotencyKey ?? idempotencyKey,
          revision: (old?.revision ?? 0) + 1,
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
        }
      const { limits, ...header } = row
      if (old) db.update(budgetMonths).set(header).where(key(home, id)).run()
      else db.insert(budgetMonths).values(header).run()
      // Keep retained limit UUIDs; audit snapshots preserve removed limits.
      const prior = db
        .select()
        .from(budgetCategoryLimits)
        .where(
          and(eq(budgetCategoryLimits.householdId, home), eq(budgetCategoryLimits.budgetId, id)),
        )
        .all()
      for (const l of prior.filter((l) => !limits.some((v) => v.categoryId === l.categoryId)))
        db.delete(budgetCategoryLimits).where(eq(budgetCategoryLimits.id, l.id)).run()
      for (const l of limits) {
        const before = prior.find((p) => p.categoryId === l.categoryId)
        if (before)
          db.update(budgetCategoryLimits)
            .set({ amountCents: l.amountCents, updatedAt: now })
            .where(eq(budgetCategoryLimits.id, before.id))
            .run()
        else
          db.insert(budgetCategoryLimits)
            .values({
              ...l,
              id: randomUUID(),
              householdId: home,
              budgetId: id,
              createdAt: now,
              updatedAt: now,
            })
            .run()
      }
      return all(home).find((r) => r.id === id)!
    },
    audit(
      home: string,
      actor: string,
      id: string,
      action: string,
      before: unknown,
      after: unknown,
      input: unknown,
    ) {
      db.insert(budgetAudit)
        .values({
          id: randomUUID(),
          householdId: home,
          actorUserId: actor,
          targetId: id,
          action,
          beforeJson: before ? JSON.stringify(before) : null,
          afterJson: JSON.stringify({ record: after, input }),
          createdAt: new Date().toISOString(),
        })
        .run()
    },
    history(home: string, id: string) {
      return db
        .select()
        .from(budgetAudit)
        .where(and(eq(budgetAudit.householdId, home), eq(budgetAudit.targetId, id)))
        .orderBy(asc(budgetAudit.createdAt))
        .all()
    },
  }
}
export type BudgetRepository = ReturnType<typeof budgetRepository>
