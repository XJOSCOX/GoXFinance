import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { users } from './users'
export const insightRecords = sqliteTable(
  'insight_records',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    insightId: text('insight_id').notNull(),
    kind: text('kind').notNull(),
    revision: integer('revision').notNull(),
    valuesJson: text('values_json').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    fingerprint: text('fingerprint').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('insight_actor_kind').on(t.householdId, t.actorUserId, t.insightId, t.kind),
    index('insight_home').on(t.householdId),
  ],
)
export const insightAudit = sqliteTable(
  'insight_audit',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    targetId: text('target_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    digest: text('digest').notNull(),
    detailsJson: text('details_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('insight_submission').on(t.householdId, t.actorUserId, t.idempotencyKey),
    index('insight_history').on(t.householdId, t.targetId),
  ],
)
