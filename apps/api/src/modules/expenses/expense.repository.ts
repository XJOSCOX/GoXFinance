import { categoryRepository } from '../categories/category.repository'
import { guardBankReference } from '../../db/financial-reference-guard'
import { financialRefunds } from '../banking/reconciliation/refund-source'
import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { type ExpenseInput } from '@goxfinance/shared'
import {
  expenses,
  expenseAllocations,
  expenseCategories,
  expenseAudit,
} from '../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../db/connection'

export function expenseRepository(db: DatabaseConnection) {
  const key = (home: string, id: string) => and(eq(expenses.householdId, home), eq(expenses.id, id))
  function hydrate(row: typeof expenses.$inferSelect) {
    return {
      ...row,
      allocations: db
        .select({
          categoryId: expenseAllocations.categoryId,
          amountCents: expenseAllocations.amountCents,
        })
        .from(expenseAllocations)
        .where(
          and(
            eq(expenseAllocations.householdId, row.householdId),
            eq(expenseAllocations.expenseId, row.id),
          ),
        )
        .orderBy(asc(expenseAllocations.categoryId))
        .all(),
    }
  }
  function allocate(home: string, id: string, values: ExpenseInput['allocations']) {
    db.delete(expenseAllocations)
      .where(and(eq(expenseAllocations.householdId, home), eq(expenseAllocations.expenseId, id)))
      .run()
    for (const value of values)
      db.insert(expenseAllocations)
        .values({ ...value, householdId: home, expenseId: id })
        .run()
  }
  return {
    refunds: (home: string) => financialRefunds(db, home).filter((r) => !!r.expenseId),
    transaction<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    categories(home: string) {
      return db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.householdId, home))
        .orderBy(asc(expenseCategories.name))
        .all()
    },
    initialize(home: string) {
      categoryRepository(db).initialize(home)
    },
    list(home: string) {
      const allocations = db
        .select()
        .from(expenseAllocations)
        .where(eq(expenseAllocations.householdId, home))
        .orderBy(asc(expenseAllocations.categoryId))
        .all()
      const grouped = allocations.reduce((m, a) => {
        const list = m.get(a.expenseId) ?? []
        list.push(a)
        m.set(a.expenseId, list)
        return m
      }, new Map<string, typeof allocations>())
      return db
        .select()
        .from(expenses)
        .where(eq(expenses.householdId, home))
        .orderBy(asc(expenses.id))
        .all()
        .map((row) => ({
          ...row,
          allocations: (grouped.get(row.id) ?? []).map((a) => ({
            categoryId: a.categoryId,
            amountCents: a.amountCents,
          })),
        }))
    },
    find(home: string, id: string) {
      const row = db.select().from(expenses).where(key(home, id)).get()
      return row ? hydrate(row) : undefined
    },
    findKey(home: string, idempotencyKey: string) {
      const row = db
        .select()
        .from(expenses)
        .where(and(eq(expenses.householdId, home), eq(expenses.idempotencyKey, idempotencyKey)))
        .get()
      return row ? hydrate(row) : undefined
    },
    create(home: string, actor: string, idempotencyKey: string, input: ExpenseInput) {
      const { allocations, ...fields } = input,
        id = randomUUID(),
        now = new Date().toISOString()
      db.insert(expenses)
        .values({
          ...fields,
          id,
          householdId: home,
          createdByUserId: actor,
          idempotencyKey,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      allocate(home, id, allocations)
      return this.find(home, id)!
    },
    update(home: string, id: string, revision: number, input: ExpenseInput) {
      guardBankReference(db, home, 'expenseId', id)
      const { allocations, ...fields } = input
      db.update(expenses)
        .set({ ...fields, revision: revision + 1, updatedAt: new Date().toISOString() })
        .where(key(home, id))
        .run()
      allocate(home, id, allocations)
      return this.find(home, id)!
    },
    void(home: string, id: string, revision: number) {
      guardBankReference(db, home, 'expenseId', id)
      db.update(expenses)
        .set({ voided: true, revision: revision + 1, updatedAt: new Date().toISOString() })
        .where(key(home, id))
        .run()
    },
    audit(
      home: string,
      id: string,
      actor: string,
      action: string,
      before: unknown,
      after: unknown,
    ) {
      db.insert(expenseAudit)
        .values({
          id: randomUUID(),
          householdId: home,
          expenseId: id,
          actorUserId: actor,
          action,
          beforeJson: before == null ? null : JSON.stringify(before),
          afterJson: after == null ? null : JSON.stringify(after),
          createdAt: new Date().toISOString(),
        })
        .run()
    },
    history(home: string, id: string) {
      return db
        .select()
        .from(expenseAudit)
        .where(and(eq(expenseAudit.householdId, home), eq(expenseAudit.expenseId, id)))
        .orderBy(asc(expenseAudit.createdAt))
        .all()
    },
  }
}
export type ExpenseRepository = ReturnType<typeof expenseRepository>
