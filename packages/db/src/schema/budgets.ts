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
import { expenseCategories } from './categories'
import { users } from './users'
export const budgetMonths = sqliteTable(
  'budget_months',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    responsibleMemberId: text('responsible_member_id'),
    scopeKey: text('scope_key').notNull(),
    month: text('month').notNull(),
    totalCents: integer('total_cents').notNull(),
    status: text('status').notNull(),
    notes: text('notes'),
    revision: integer('revision').notNull().default(1),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('budget_scope_month').on(t.householdId, t.month, t.scopeKey),
    uniqueIndex('budget_id_home').on(t.id, t.householdId),
    uniqueIndex('budget_submission').on(t.householdId, t.idempotencyKey),
    index('budget_month_status').on(t.householdId, t.month, t.status),
    foreignKey({
      columns: [t.responsibleMemberId, t.householdId],
      foreignColumns: [householdMembers.id, householdMembers.householdId],
    }),
    check(
      'budget_scope_valid',
      sql`(${t.responsibleMemberId} is null and ${t.scopeKey} = 'household') or (${t.responsibleMemberId} is not null and ${t.scopeKey} = ${t.responsibleMemberId})`,
    ),
    check(
      'budget_amount_valid',
      sql`${t.totalCents} >= 0 and ${t.totalCents} <= 9007199254740991 and cast(${t.totalCents} as integer) = ${t.totalCents}`,
    ),
    check('budget_status_valid', sql`${t.status} in ('active','archived')`),
  ],
)
export const budgetCategoryLimits = sqliteTable(
  'budget_category_limits',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    budgetId: text('budget_id').notNull(),
    categoryId: text('category_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('budget_limit_category').on(t.budgetId, t.categoryId),
    index('budget_limit_home').on(t.householdId, t.budgetId),
    foreignKey({
      columns: [t.budgetId, t.householdId],
      foreignColumns: [budgetMonths.id, budgetMonths.householdId],
    }),
    foreignKey({
      columns: [t.categoryId, t.householdId],
      foreignColumns: [expenseCategories.id, expenseCategories.householdId],
    }),
    check(
      'budget_limit_amount',
      sql`${t.amountCents} >= 0 and ${t.amountCents} <= 9007199254740991 and cast(${t.amountCents} as integer) = ${t.amountCents}`,
    ),
  ],
)
export const budgetAudit = sqliteTable(
  'budget_audit',
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
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('budget_audit_target').on(t.householdId, t.targetId, t.createdAt)],
)
