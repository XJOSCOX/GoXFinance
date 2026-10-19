import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { households } from './households'

export const expenseCategories = sqliteTable(
  'expense_categories',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
    normalizedName: text('normalized_name').notNull().default(''),
    description: text('description'),
    icon: text('icon'),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    revision: integer('revision').notNull().default(1),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (table) => [
    uniqueIndex('financial_category_name').on(table.householdId, table.normalizedName),
    uniqueIndex('expense_category_name').on(table.householdId, table.name),
    uniqueIndex('expense_category_scope').on(table.id, table.householdId),
  ],
)
