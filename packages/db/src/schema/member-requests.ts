import { sql } from 'drizzle-orm'
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { users } from './users'

export const householdMemberRequests = sqliteTable('household_member_requests', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  proposedByUserId: text('proposed_by_user_id').notNull().references(() => users.id),
  fullName: text('full_name').notNull(),
  relationship: text('relationship', { enum: ['self', 'spouse', 'child', 'parent', 'other'] }).notNull(),
  notes: text('notes'),
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'cancelled'] }).notNull(),
  reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
  reviewedAt: text('reviewed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [
  index('member_requests_household_status_idx').on(table.householdId, table.status),
  uniqueIndex('member_requests_pending_unique').on(table.householdId, table.proposedByUserId, table.fullName, table.relationship).where(sql`${table.status} = 'pending'`),
  check('member_requests_status_check', sql`${table.status} in ('pending','approved','rejected','cancelled')`),
  check('member_requests_name_length', sql`length(${table.fullName}) between 1 and 120`),
])
