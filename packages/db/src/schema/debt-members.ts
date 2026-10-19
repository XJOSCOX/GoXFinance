import { sql } from 'drizzle-orm'
import { check, foreignKey, index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { debts } from './debts'
import { householdMembers } from './household-members'
import { households } from './households'

export const debtMembers = sqliteTable('debt_members', {
  debtId: text('debt_id').notNull(),
  householdId: text('household_id').notNull().references(() => households.id),
  householdMemberId: text('household_member_id').notNull(),
  responsibility: text('responsibility').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [
  primaryKey({ columns: [table.debtId, table.householdMemberId] }),
  index('debt_members_household_member_idx').on(table.householdId, table.householdMemberId),
  foreignKey({ columns: [table.debtId, table.householdId], foreignColumns: [debts.id, debts.householdId], name: 'debt_members_debt_household_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.householdMemberId, table.householdId], foreignColumns: [householdMembers.id, householdMembers.householdId], name: 'debt_members_member_household_fk' }),
  check('debt_members_responsibility', sql`${table.responsibility} in ('primary','joint','authorized_user','other')`),
])
