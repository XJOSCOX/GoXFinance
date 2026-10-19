import { sql } from 'drizzle-orm'
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { users } from './users'

export const householdMembers = sqliteTable('household_members', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  linkedUserId: text('linked_user_id').references(() => users.id, { onDelete: 'set null' }),
  fullName: text('full_name').notNull(),
  relationship: text('relationship', { enum: ['self', 'spouse', 'child', 'parent', 'other'] }).notNull(),
  status: text('status', { enum: ['active', 'inactive'] }).notNull(),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [
  index('household_members_household_idx').on(table.householdId),
  index('household_members_linked_user_idx').on(table.linkedUserId),
  uniqueIndex('household_members_linked_user_unique').on(table.householdId, table.linkedUserId),
  uniqueIndex('household_members_id_household_unique').on(table.id, table.householdId),
  check('household_members_name_length', sql`length(${table.fullName}) between 1 and 120`),
  check('household_members_relationship_check', sql`${table.relationship} in ('self','spouse','child','parent','other')`),
  check('household_members_status_check', sql`${table.status} in ('active','inactive')`),
])
