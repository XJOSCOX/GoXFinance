import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { users } from './users'
export const plannerRecords = sqliteTable(
  'planner_records',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    revision: integer('revision').notNull(),
    valuesJson: text('values_json').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('planner_record_home').on(t.householdId)],
)
export const plannerRequests = sqliteTable(
  'planner_requests',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    targetId: text('target_id'),
    revision: integer('revision').notNull(),
    valuesJson: text('values_json').notNull(),
    fingerprint: text('fingerprint').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull(),
    reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('planner_request_home').on(t.householdId)],
)
export const plannerAudit = sqliteTable(
  'planner_audit',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    targetId: text('target_id').notNull(),
    action: text('action').notNull(),
    detailsJson: text('details_json').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    digest: text('digest').notNull(),
    resultJson: text('result_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('planner_submission').on(t.householdId, t.idempotencyKey),
    index('planner_audit_home').on(t.householdId, t.targetId),
  ],
)
export const plannerSnapshots = sqliteTable(
  'planner_snapshots',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    inputJson: text('input_json').notNull(),
    sourcesJson: text('sources_json').notNull(),
    reportJson: text('report_json').notNull(),
    fingerprint: text('fingerprint').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('planner_snapshot_home').on(t.householdId)],
)
