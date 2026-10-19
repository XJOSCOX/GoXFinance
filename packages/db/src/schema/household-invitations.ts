import { sql } from 'drizzle-orm'
import { check, foreignKey, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { householdMembers } from './household-members'
import { users } from './users'

export const householdInvitations = sqliteTable('household_invitations', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  memberId: text('member_id').notNull(),
  activeMemberId: text('active_member_id'),
  codeHash: text('code_hash').notNull(),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] }).notNull(),
  status: text('status', { enum: ['pending', 'redeemed', 'revoked', 'expired'] }).notNull(),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  redeemedByUserId: text('redeemed_by_user_id').references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  redeemedAt: text('redeemed_at'),
  revokedAt: text('revoked_at'),
}, table => [
  foreignKey({ columns: [table.memberId, table.householdId], foreignColumns: [householdMembers.id, householdMembers.householdId] }),
  uniqueIndex('household_invitations_code_unique').on(table.codeHash),
  uniqueIndex('household_invitations_active_member_unique').on(table.activeMemberId),
  index('household_invitations_household_member_idx').on(table.householdId, table.memberId),
  index('household_invitations_status_expiry_idx').on(table.status, table.expiresAt),
  check('household_invitations_role_check', sql`${table.role} in ('admin','editor','viewer')`),
  check('household_invitations_status_check', sql`${table.status} in ('pending','redeemed','revoked','expired')`),
  check('household_invitations_active_check', sql`(${table.status} = 'pending' and ${table.activeMemberId} is not null and ${table.activeMemberId} = ${table.memberId}) or (${table.status} <> 'pending' and ${table.activeMemberId} is null)`),
])
