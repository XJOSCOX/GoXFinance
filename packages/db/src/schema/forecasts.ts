import { sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { users } from './users'
export const forecastScenarios = sqliteTable(
  'forecast_scenarios',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    inputJson: text('input_json').notNull(),
    sourcesJson: text('sources_json').notNull(),
    reportJson: text('report_json').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('forecast_submission').on(t.householdId, t.idempotencyKey),
    index('forecast_history').on(t.householdId, t.createdAt),
  ],
)
export const forecastAudit = sqliteTable(
  'forecast_audit',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => forecastScenarios.id),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('forecast_audit_home').on(t.householdId, t.scenarioId)],
)
