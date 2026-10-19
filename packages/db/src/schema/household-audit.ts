import { sql } from 'drizzle-orm'
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { householdMembers } from './household-members'
import { householdMemberRequests } from './member-requests'
import { users } from './users'

export const householdAudit = sqliteTable('household_audit', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  targetMemberId: text('target_member_id').references(() => householdMembers.id),
  targetRequestId: text('target_request_id').references(() => householdMemberRequests.id),
  actorUserId: text('actor_user_id').notNull().references(() => users.id),
  action: text('action', { enum: ['role_changed', 'planned_role_changed', 'request_submitted', 'request_approved', 'request_rejected', 'request_cancelled'] }).notNull(),
  previousRole: text('previous_role', { enum: ['owner', 'admin', 'editor', 'viewer'] }),
  newRole: text('new_role', { enum: ['owner', 'admin', 'editor', 'viewer'] }),
  createdAt: text('created_at').notNull(),
}, table => [
  index('household_audit_household_time_idx').on(table.householdId, table.createdAt),
  index('household_audit_member_idx').on(table.targetMemberId),
  index('household_audit_request_idx').on(table.targetRequestId),
  check('household_audit_action_check', sql`${table.action} in ('role_changed','planned_role_changed','request_submitted','request_approved','request_rejected','request_cancelled')`),
])
