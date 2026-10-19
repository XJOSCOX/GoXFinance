import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { debts } from './debts'
import { households } from './households'
import { users } from './users'

export const debtPayments = sqliteTable('debt_payments', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => households.id),
  debtId: text('debt_id').notNull(),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  idempotencyKey: text('idempotency_key').notNull(),
  amountCents: integer('amount_cents').notNull(),
  paymentDate: text('payment_date').notNull(),
  paymentStatus: text('payment_status').notNull(),
  paymentMethod: text('payment_method').notNull(),
  principalAmountCents: integer('principal_amount_cents'),
  interestAmountCents: integer('interest_amount_cents'),
  feesAmountCents: integer('fees_amount_cents'),
  referenceNumber: text('reference_number'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [
  uniqueIndex('debt_payments_id_household_debt_unique').on(table.id, table.householdId, table.debtId),
  uniqueIndex('debt_payments_idempotency_unique').on(table.householdId, table.debtId, table.idempotencyKey),
  index('debt_payments_debt_date_idx').on(table.householdId, table.debtId, table.paymentDate),
  foreignKey({ columns: [table.debtId, table.householdId], foreignColumns: [debts.id, debts.householdId], name: 'debt_payments_debt_household_fk' }),
  check('debt_payments_amount_positive', sql`${table.amountCents} > 0`),
  check('debt_payments_principal_nonnegative', sql`${table.principalAmountCents} is null or ${table.principalAmountCents} >= 0`),
  check('debt_payments_interest_nonnegative', sql`${table.interestAmountCents} is null or ${table.interestAmountCents} >= 0`),
  check('debt_payments_fees_nonnegative', sql`${table.feesAmountCents} is null or ${table.feesAmountCents} >= 0`),
  check('debt_payments_allocation', sql`coalesce(${table.principalAmountCents},0) + coalesce(${table.interestAmountCents},0) + coalesce(${table.feesAmountCents},0) <= ${table.amountCents}`),
  check('debt_payments_status', sql`${table.paymentStatus} in ('scheduled','pending','completed','failed','cancelled')`),
  check('debt_payments_method', sql`${table.paymentMethod} in ('bank_transfer','debit_card','credit_card','cash','check','other')`),
])

export const debtPaymentAudit = sqliteTable('debt_payment_audit', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => households.id),
  debtId: text('debt_id').notNull(),
  paymentId: text('payment_id').notNull(),
  actorUserId: text('actor_user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  createdAt: text('created_at').notNull(),
}, table => [
  index('debt_payment_audit_payment_idx').on(table.paymentId, table.createdAt),
  foreignKey({ columns: [table.paymentId, table.householdId, table.debtId],
    foreignColumns: [debtPayments.id, debtPayments.householdId, debtPayments.debtId], name: 'debt_payment_audit_payment_fk' }),
  check('debt_payment_audit_action', sql`${table.action} in ('created','edited','cancelled','confirmed')`),
])
