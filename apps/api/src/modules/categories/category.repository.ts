import { randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import {
  defaultFinancialCategories,
  normalizeCategoryName,
  type CategoryInput,
} from '@goxfinance/shared'
import {
  expenseCategories,
  bills,
  billPeriods,
  debts,
  expenseAllocations,
} from '../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../db/connection'
import { FinancialError } from '../households/financial-access'

export function categoryRepository(db: DatabaseConnection) {
  const key = (home: string, id: string) =>
    and(eq(expenseCategories.householdId, home), eq(expenseCategories.id, id))
  function list(home: string) {
    return db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.householdId, home))
      .orderBy(asc(expenseCategories.name))
      .all()
  }
  function find(home: string, id: string) {
    return db.select().from(expenseCategories).where(key(home, id)).get()
  }
  return {
    list,
    find,
    transaction<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    initialize(home: string) {
      // Provision once. Renaming a standard category must not recreate its old name.
      if (list(home).length) return
      for (const name of defaultFinancialCategories) {
        if (
          list(home).some(
            (category) => normalizeCategoryName(category.name) === normalizeCategoryName(name),
          )
        )
          continue
        const now = new Date().toISOString()
        db.insert(expenseCategories)
          .values({
            id: randomUUID(),
            householdId: home,
            name,
            normalizedName: normalizeCategoryName(name),
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .run()
      }
    },
    create(home: string, input: CategoryInput) {
      const id = randomUUID(),
        now = new Date().toISOString()
      db.insert(expenseCategories)
        .values({
          ...input,
          id,
          householdId: home,
          normalizedName: normalizeCategoryName(input.name),
          createdAt: now,
          updatedAt: now,
        })
        .run()
      return find(home, id)!
    },
    update(
      home: string,
      id: string,
      values: CategoryInput & { archived: boolean; revision: number },
    ) {
      db.update(expenseCategories)
        .set({
          ...values,
          normalizedName: normalizeCategoryName(values.name),
          revision: values.revision + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(and(key(home, id), eq(expenseCategories.revision, values.revision)))
        .run()
      return find(home, id)!
    },
    assign(home: string, id: string | null | undefined, existing?: string | null) {
      if (!id) return null
      const category = find(home, id)
      if (!category || (category.archived && id !== existing))
        throw new FinancialError('Select an active category from this household', 400)
      return category
    },
    resolveBill(
      home: string,
      id: string | null | undefined,
      label: string,
      existing?: string | null,
    ) {
      const category = id
        ? this.assign(home, id, existing)
        : list(home).find(
            (item) => normalizeCategoryName(item.name) === normalizeCategoryName(label || 'Other'),
          )
      if (!category || (category.archived && category.id !== existing))
        throw new FinancialError('Select an active household category', 400)
      return category
    },
    usage(home: string, id: string) {
      const count = (table: typeof bills | typeof billPeriods | typeof debts) =>
        db
          .select({ count: sql<number>`count(*)` })
          .from(table)
          .where(and(eq(table.householdId, home), eq(table.categoryId, id)))
          .get()!.count
      const expenses = db
        .select({ count: sql<number>`count(distinct ${expenseAllocations.expenseId})` })
        .from(expenseAllocations)
        .where(and(eq(expenseAllocations.householdId, home), eq(expenseAllocations.categoryId, id)))
        .get()!.count
      return { bills: count(bills), billPeriods: count(billPeriods), debts: count(debts), expenses }
    },
  }
}
export type CategoryRepository = ReturnType<typeof categoryRepository>
