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
import { users } from './users'
import { debts } from './debts'
import { debtPayments } from './debt-payments'

export const bills = sqliteTable(
  'bills',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    category: text('category').notNull(),
    kind: text('kind').notNull(),
    amountType: text('amount_type').notNull(),
    amountCents: integer('amount_cents'),
    estimatedAmountCents: integer('estimated_amount_cents'),
    frequency: text('frequency'),
    nextDueDate: text('next_due_date').notNull(),
    endDate: text('end_date'),
    autoPay: integer('auto_pay', { mode: 'boolean' }).notNull(),
    status: text('status').notNull(),
    notes: text('notes'),
    linkedDebtId: text('linked_debt_id'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('bills_id_household').on(table.id, table.householdId),
    index('bills_household_status_due').on(table.householdId, table.status, table.nextDueDate),
    uniqueIndex('bills_active_debt')
      .on(table.householdId, table.linkedDebtId)
      .where(sql`${table.status} = 'active'`),
    foreignKey({
      columns: [table.linkedDebtId, table.householdId],
      foreignColumns: [debts.id, debts.householdId],
    }),
    check('bill_kind', sql`${table.kind} in ('recurring','one_time')`),
    check('bill_amount_type', sql`${table.amountType} in ('fixed','variable')`),
    check(
      'bill_amount_nonnegative',
      sql`(${table.amountCents} is null or ${table.amountCents} >= 0) and (${table.estimatedAmountCents} is null or ${table.estimatedAmountCents} >= 0)`,
    ),
    check(
      'bill_schedule',
      sql`(${table.kind}='recurring' and ${table.frequency} in ('weekly','biweekly','monthly','quarterly','annually') and ${table.status} in ('active','inactive')) or (${table.kind}='one_time' and ${table.frequency} is null and ${table.linkedDebtId} is null and ${table.endDate} is null and ${table.status} in ('active','cancelled'))`,
    ),
    check(
      'bill_end_date',
      sql`${table.endDate} is null or ${table.endDate} >= ${table.nextDueDate}`,
    ),
  ],
)
export const billMembers = sqliteTable(
  'bill_members',
  {
    billId: text('bill_id').notNull(),
    householdId: text('household_id').notNull(),
    memberId: text('member_id').notNull(),
  },
  (table) => [
    uniqueIndex('bill_members_unique').on(table.billId, table.memberId),
    foreignKey({
      columns: [table.billId, table.householdId],
      foreignColumns: [bills.id, bills.householdId],
    }),
    foreignKey({
      columns: [table.memberId, table.householdId],
      foreignColumns: [householdMembers.id, householdMembers.householdId],
    }),
  ],
)
export const billPeriods = sqliteTable(
  'bill_periods',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    billId: text('bill_id').notNull(),
    dueDate: text('due_date').notNull(),
    billingPeriod: text('billing_period').notNull().default(''),
    name: text('name').notNull(),
    category: text('category').notNull(),
    amountCents: integer('amount_cents'),
    estimatedAmountCents: integer('estimated_amount_cents'),
    linkedDebtId: text('linked_debt_id'),
    creditCents: integer('credit_cents').notNull().default(0),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('bill_period_due').on(table.householdId, table.billId, table.dueDate),
    uniqueIndex('bill_period_scope').on(table.id, table.householdId, table.billId),
    index('bill_period_household_due').on(table.householdId, table.dueDate),
    foreignKey({
      columns: [table.billId, table.householdId],
      foreignColumns: [bills.id, bills.householdId],
    }),
    foreignKey({
      columns: [table.linkedDebtId, table.householdId],
      foreignColumns: [debts.id, debts.householdId],
    }),
    check(
      'bill_period_amount',
      sql`(${table.amountCents} is null or ${table.amountCents} >= 0) and (${table.estimatedAmountCents} is null or ${table.estimatedAmountCents} >= 0) and ${table.creditCents} >= 0`,
    ),
  ],
)
export const billPayments = sqliteTable(
  'bill_payments',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    billId: text('bill_id').notNull(),
    periodId: text('period_id').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    idempotencyKey: text('idempotency_key').notNull(),
    amountCents: integer('amount_cents').notNull(),
    paymentDate: text('payment_date').notNull(),
    method: text('method').notNull(),
    status: text('status').notNull().default('pending'),
    notes: text('notes'),
    debtId: text('debt_id'),
    debtPaymentId: text('debt_payment_id'),
    confirmedAt: text('confirmed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('bill_payment_key').on(table.householdId, table.idempotencyKey),
    uniqueIndex('bill_payment_debt_link').on(table.debtPaymentId),
    index('bill_payment_period').on(table.householdId, table.billId, table.periodId),
    foreignKey({
      columns: [table.periodId, table.householdId, table.billId],
      foreignColumns: [billPeriods.id, billPeriods.householdId, billPeriods.billId],
    }),
    foreignKey({
      columns: [table.debtId, table.householdId],
      foreignColumns: [debts.id, debts.householdId],
    }),
    foreignKey({
      columns: [table.debtPaymentId, table.householdId, table.debtId],
      foreignColumns: [debtPayments.id, debtPayments.householdId, debtPayments.debtId],
    }),
    check('bill_payment_link', sql`${table.debtPaymentId} is null or ${table.debtId} is not null`),
    check('bill_payment_amount', sql`${table.amountCents}>0`),
    check('bill_payment_status', sql`${table.status} in ('pending','completed','cancelled')`),
    check(
      'bill_payment_confirmed',
      sql`${table.status} <> 'completed' or ${table.confirmedAt} is not null`,
    ),
    check(
      'bill_payment_method',
      sql`${table.method} in ('bank_transfer','debit_card','credit_card','cash','check','other')`,
    ),
  ],
)
export const billAudit = sqliteTable(
  'bill_audit',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    billId: text('bill_id').notNull(),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    targetId: text('target_id').notNull(),
    action: text('action').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.billId, table.householdId],
      foreignColumns: [bills.id, bills.householdId],
    }),
    index('bill_audit_target').on(table.householdId, table.billId, table.createdAt),
  ],
)
export const billChangeRequests = sqliteTable(
  'bill_change_requests',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    billId: text('bill_id').notNull(),
    proposedByUserId: text('proposed_by_user_id')
      .notNull()
      .references(() => users.id),
    proposalJson: text('proposal_json').notNull(),
    originalJson: text('original_json').notNull(),
    baseHash: text('base_hash').notNull(),
    reason: text('reason').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    activeTarget: text('active_target'),
    status: text('status').notNull().default('pending'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
    reviewedAt: text('reviewed_at'),
    reviewNote: text('review_note'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.billId, table.householdId],
      foreignColumns: [bills.id, bills.householdId],
    }),
    uniqueIndex('bill_request_key').on(
      table.householdId,
      table.proposedByUserId,
      table.idempotencyKey,
    ),
    uniqueIndex('bill_request_pending').on(
      table.householdId,
      table.billId,
      table.proposedByUserId,
      table.activeTarget,
    ),
    index('bill_request_household_status').on(table.householdId, table.status),
    check(
      'bill_request_status',
      sql`${table.status} in ('pending','approved','rejected','cancelled')`,
    ),
    check(
      'bill_request_review',
      sql`(${table.status}='pending' and ${table.activeTarget} is not null and ${table.reviewedByUserId} is null) or (${table.status}<>'pending' and ${table.activeTarget} is null and ${table.reviewedByUserId} is not null)`,
    ),
  ],
)
