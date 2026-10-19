import { sql } from 'drizzle-orm'
import { check, foreignKey, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { debts } from './debts'
import { debtPayments } from './debt-payments'
import { users } from './users'

export const debtChangeRequests = sqliteTable('debt_change_requests', {
  id: text('id').primaryKey(), householdId: text('household_id').notNull(), debtId: text('debt_id').notNull(),
  paymentId: text('payment_id'), proposedByUserId: text('proposed_by_user_id').notNull().references(() => users.id),
  action: text('action').notNull(), payloadJson: text('payload_json').notNull(), originalJson: text('original_json').notNull(),
  baseHash: text('base_hash').notNull(), reason: text('reason').notNull(), idempotencyKey: text('idempotency_key').notNull(),
  activeTarget: text('active_target'), status: text('status').notNull().default('pending'),
  reviewedByUserId: text('reviewed_by_user_id').references(() => users.id), reviewedAt: text('reviewed_at'),
  reviewNote: text('review_note'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, table => [
  foreignKey({ columns: [table.debtId, table.householdId], foreignColumns: [debts.id, debts.householdId] }),
  foreignKey({ columns: [table.paymentId, table.householdId, table.debtId], foreignColumns: [debtPayments.id, debtPayments.householdId, debtPayments.debtId] }),
  uniqueIndex('debt_change_request_key').on(table.householdId, table.proposedByUserId, table.idempotencyKey),
  uniqueIndex('debt_change_pending_target').on(table.householdId, table.debtId, table.proposedByUserId, table.activeTarget),
  index('debt_change_household_status').on(table.householdId, table.status),
  check('debt_change_status', sql`${table.status} in ('pending','approved','rejected','cancelled')`),
  check('debt_change_action', sql`${table.action} in ('edit_payment','cancel_payment','confirm_payment','verify_balance')`),
  check('debt_change_target', sql`(${table.action} = 'verify_balance' and ${table.paymentId} is null) or (${table.action} <> 'verify_balance' and ${table.paymentId} is not null)`),
  check('debt_change_review', sql`(${table.status} = 'pending' and ${table.activeTarget} is not null and ${table.reviewedByUserId} is null) or (${table.status} <> 'pending' and ${table.activeTarget} is null and ${table.reviewedByUserId} is not null)`),
])
export const debtChangeAudit = sqliteTable('debt_change_audit', {
  id: text('id').primaryKey(), requestId: text('request_id').notNull().references(() => debtChangeRequests.id),
  actorUserId: text('actor_user_id').notNull().references(() => users.id), action: text('action').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [index('debt_change_audit_request').on(table.requestId, table.createdAt),
  check('debt_change_audit_action', sql`${table.action} in ('submitted','approved','rejected','cancelled')`),
])
