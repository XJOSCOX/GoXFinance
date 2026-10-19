import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  foreignKey,
  check,
} from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { householdMembers } from './household-members'
import { users } from './users'
const stamps = () => ({
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  revision: integer('revision').notNull().default(1),
})
const owner = () => ({
  id: text('id').primaryKey(),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => users.id),
  idempotencyKey: text('idempotency_key').notNull(),
  ...stamps(),
})
import { tradingAccounts, copyGroups } from './trading'

export const financialGoals = sqliteTable(
  'financial_goals',
  {
    ...owner(),
    timezone: text('timezone'),
    sessionStart: text('session_start'),
    name: text('name').notNull(),
    goalType: text('goal_type').notNull(),
    targetCents: integer('target_cents').notNull(),
    period: text('period').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    responsibleMemberId: text('responsible_member_id'),
    tradingAccountId: text('trading_account_id'),
    copyGroupId: text('copy_group_id'),
    direction: text('direction').notNull(),
    status: text('status').notNull(),
    notes: text('notes'),
  },
  (t) => [
    uniqueIndex('goal_scope').on(t.id, t.householdId),
    uniqueIndex('goal_submission').on(t.householdId, t.idempotencyKey),
    index('goal_member').on(t.householdId, t.responsibleMemberId),
    foreignKey({
      columns: [t.responsibleMemberId, t.householdId],
      foreignColumns: [householdMembers.id, householdMembers.householdId],
    }),
    foreignKey({
      columns: [t.tradingAccountId, t.householdId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.householdId],
    }),
    foreignKey({
      columns: [t.copyGroupId, t.householdId],
      foreignColumns: [copyGroups.id, copyGroups.householdId],
    }),
    check('goal_target', sql`${t.targetCents} >= 0`),
    check('goal_dates', sql`${t.endDate} >= ${t.startDate}`),
    check('goal_direction', sql`${t.direction} in ('at_least','at_most')`),
    check('goal_status', sql`${t.status} in ('active','paused','completed')`),
    check(
      'goal_type',
      sql`${t.goalType} in ('trading_profit','trading_loss','confirmed_income','savings','debt_reduction','spending_limit','bill_completion','manual')`,
    ),
    check(
      'goal_period',
      sql`${t.period} in ('daily','weekly','monthly','quarterly','yearly','custom')`,
    ),
  ],
)
export const goalContributions = sqliteTable(
  'goal_contributions',
  {
    ...owner(),
    goalId: text('goal_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    date: text('date').notNull(),
    notes: text('notes').notNull(),
  },
  (t) => [
    uniqueIndex('goal_contribution_submission').on(t.householdId, t.idempotencyKey),
    index('goal_contribution_date').on(t.householdId, t.goalId, t.date),
    foreignKey({
      columns: [t.goalId, t.householdId],
      foreignColumns: [financialGoals.id, financialGoals.householdId],
    }),
  ],
)
export const goalAudit = sqliteTable(
  'goal_audit',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    targetId: text('target_id').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('goal_audit_target').on(t.householdId, t.targetId, t.createdAt)],
)
