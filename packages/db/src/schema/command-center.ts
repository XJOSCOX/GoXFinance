import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { users } from './users'
export const commandPreferences = sqliteTable(
  'command_preferences',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    revision: integer('revision').notNull(),
    valuesJson: text('values_json').notNull(),
    createdAt: text('created_at').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
  },
  (t) => [
    uniqueIndex('command_pref_version').on(t.householdId, t.actorUserId, t.revision),
    uniqueIndex('command_pref_submission').on(t.householdId, t.actorUserId, t.idempotencyKey),
  ],
)
