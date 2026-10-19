import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { householdMembers } from './household-members'
import { debts } from './debts'
import { users } from './users'

export const expenseCategories = sqliteTable(
  'expense_categories',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('expense_category_name').on(table.householdId, table.name),
    uniqueIndex('expense_category_scope').on(table.id, table.householdId),
  ],
)
export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    responsibleMemberId: text('responsible_member_id').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    description: text('description').notNull(),
    merchant: text('merchant'),
    amountCents: integer('amount_cents').notNull(),
    transactionDate: text('transaction_date').notNull(),
    paymentMethod: text('payment_method').notNull(),
    linkedDebtId: text('linked_debt_id'),
    notes: text('notes'),
    idempotencyKey: text('idempotency_key').notNull(),
    voided: integer('voided', { mode: 'boolean' }).notNull().default(false),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('expense_scope').on(table.id, table.householdId),
    uniqueIndex('expense_submission').on(table.householdId, table.idempotencyKey),
    index('expense_household_date').on(table.householdId, table.transactionDate),
    index('expense_member').on(table.householdId, table.responsibleMemberId),
    foreignKey({
      columns: [table.responsibleMemberId, table.householdId],
      foreignColumns: [householdMembers.id, householdMembers.householdId],
    }),
    foreignKey({
      columns: [table.linkedDebtId, table.householdId],
      foreignColumns: [debts.id, debts.householdId],
    }),
    check('expense_amount', sql`${table.amountCents} > 0`),
    check(
      'expense_credit_link',
      sql`${table.linkedDebtId} is null or ${table.paymentMethod} = 'credit_card'`,
    ),
    check(
      'expense_method',
      sql`${table.paymentMethod} in ('bank_transfer','debit_card','credit_card','cash','check','other')`,
    ),
  ],
)
export const expenseAllocations = sqliteTable(
  'expense_category_allocations',
  {
    expenseId: text('expense_id').notNull(),
    householdId: text('household_id').notNull(),
    categoryId: text('category_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
  },
  (table) => [
    uniqueIndex('expense_allocation_unique').on(table.expenseId, table.categoryId),
    foreignKey({
      columns: [table.expenseId, table.householdId],
      foreignColumns: [expenses.id, expenses.householdId],
    }),
    foreignKey({
      columns: [table.categoryId, table.householdId],
      foreignColumns: [expenseCategories.id, expenseCategories.householdId],
    }),
    check('expense_allocation_amount', sql`${table.amountCents} > 0`),
  ],
)
export const expenseAudit = sqliteTable(
  'expense_audit',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    expenseId: text('expense_id').notNull(),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.expenseId, table.householdId],
      foreignColumns: [expenses.id, expenses.householdId],
    }),
    index('expense_audit_record').on(table.householdId, table.expenseId, table.createdAt),
  ],
)
