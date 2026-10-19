import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { debts } from './debts'
import { households } from './households'
import { users } from './users'

export const debtBalanceHistory = sqliteTable('debt_balance_history', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => households.id),
  debtId: text('debt_id').notNull(),
  balanceCents: integer('balance_cents').notNull(),
  effectiveDate: text('effective_date').notNull(),
  source: text('source').notNull(),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  requestKey: text('request_key'),
}, table => [
  index('debt_balance_history_date_idx').on(table.householdId, table.debtId, table.effectiveDate),
  uniqueIndex('debt_balance_history_request_key').on(table.householdId, table.debtId, table.requestKey),
  foreignKey({ columns: [table.debtId, table.householdId], foreignColumns: [debts.id, debts.householdId], name: 'debt_balance_history_debt_household_fk' }),
  check('debt_balance_history_balance', sql`${table.balanceCents} >= 0`),
  check('debt_balance_history_source', sql`${table.source} in ('initial','creditor_statement','manual_adjustment','reconciliation')`),
])
