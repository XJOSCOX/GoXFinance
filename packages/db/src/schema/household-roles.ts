import { sql } from 'drizzle-orm'
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { users } from './users'

export const householdUserRoles = sqliteTable('household_user_roles', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'admin', 'editor', 'viewer'] }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [
  uniqueIndex('household_user_roles_unique').on(table.householdId, table.userId),
  index('household_user_roles_user_idx').on(table.userId),
  check('household_user_roles_role_check', sql`${table.role} in ('owner','admin','editor','viewer')`),
])
