import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import {
  defaultFinancialCategories,
  normalizeCategoryName,
  type PublicUser,
} from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
import {
  households,
  householdMembers,
  householdUserRoles,
  expenseCategories,
} from '../../../../../packages/db/src/schema'

export function householdRepository(db: DatabaseConnection) {
  return {
    listForUser(userId: string) {
      return db
        .select({ household: households, role: householdUserRoles.role })
        .from(householdUserRoles)
        .innerJoin(households, eq(householdUserRoles.householdId, households.id))
        .where(eq(householdUserRoles.userId, userId))
        .all()
    },
    findHousehold(id: string) {
      return db.select().from(households).where(eq(households.id, id)).get()
    },
    findRole(householdId: string, userId: string) {
      return db
        .select()
        .from(householdUserRoles)
        .where(
          and(
            eq(householdUserRoles.householdId, householdId),
            eq(householdUserRoles.userId, userId),
          ),
        )
        .get()
    },
    updateDetails(
      id: string,
      changes: { name?: string; moveInDate?: string | null; notes?: string | null },
    ) {
      const updatedAt = new Date().toISOString()
      db.update(households)
        .set({ ...changes, updatedAt })
        .where(eq(households.id, id))
        .run()
      return db.select().from(households).where(eq(households.id, id)).get()!
    },
    createInitial(user: PublicUser, name: string) {
      return db.transaction((tx) => {
        const existing = tx
          .select({ household: households, role: householdUserRoles.role })
          .from(householdUserRoles)
          .innerJoin(households, eq(householdUserRoles.householdId, households.id))
          .where(eq(householdUserRoles.userId, user.id))
          .get()
        if (existing) return { ...existing, created: false }

        const id = randomUUID()
        const now = new Date().toISOString()
        const household = {
          id,
          name,
          moveInDate: null,
          notes: null,
          createdByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        }
        tx.insert(households).values(household).run()
        tx.insert(householdUserRoles)
          .values({
            id: randomUUID(),
            householdId: id,
            userId: user.id,
            role: 'owner',
            createdAt: now,
            updatedAt: now,
          })
          .run()
        tx.insert(householdMembers)
          .values({
            id: randomUUID(),
            householdId: id,
            linkedUserId: user.id,
            fullName: user.fullName,
            relationship: 'self',
            status: 'active',
            notes: null,
            createdAt: now,
            updatedAt: now,
          })
          .run()
        for (const categoryName of defaultFinancialCategories)
          tx.insert(expenseCategories)
            .values({
              id: randomUUID(),
              householdId: id,
              name: categoryName,
              normalizedName: normalizeCategoryName(categoryName),
              createdAt: now,
              updatedAt: now,
            })
            .run()
        return { household, role: 'owner' as const, created: true }
      })
    },
  }
}

export type HouseholdRepository = ReturnType<typeof householdRepository>
