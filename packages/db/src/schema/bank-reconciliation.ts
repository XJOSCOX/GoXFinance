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
import { bankTransactions } from './bank-transactions'
import { users } from './users'
import { expenses } from './expenses'
import { expenseCategories } from './categories'
import { incomeTransactions } from './income'
import { billPayments } from './bills'
import { debtPayments } from './debt-payments'
import { households } from './households'
export const bankRefunds = sqliteTable(
  'bank_refunds',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    transactionId: text('transaction_id').notNull(),
    expenseId: text('expense_id'),
    billPaymentId: text('bill_payment_id'),
    debtPaymentId: text('debt_payment_id'),
    amountCents: integer('amount_cents').notNull(),
    date: text('date').notNull(),
    method: text('method').notNull(),
    status: text('status').notNull(),
    notes: text('notes'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('bank_refund_home_id').on(t.id, t.householdId),
    uniqueIndex('bank_refund_transaction_once').on(t.transactionId),
    foreignKey({
      columns: [t.transactionId, t.householdId],
      foreignColumns: [bankTransactions.id, bankTransactions.householdId],
    }),
    foreignKey({
      columns: [t.expenseId, t.householdId],
      foreignColumns: [expenses.id, expenses.householdId],
    }),
    foreignKey({
      columns: [t.billPaymentId, t.householdId],
      foreignColumns: [billPayments.id, billPayments.householdId],
    }),
    foreignKey({
      columns: [t.debtPaymentId, t.householdId],
      foreignColumns: [debtPayments.id, debtPayments.householdId],
    }),
    check(
      'bank_refund_parent',
      sql`(case when ${t.expenseId} is null then 0 else 1 end)+(case when ${t.billPaymentId} is null then 0 else 1 end)+(case when ${t.debtPaymentId} is null then 0 else 1 end)=1`,
    ),
    check(
      'bank_refund_amount',
      sql`(${t.amountCents}>0 and ${t.amountCents}<=9007199254740991) and (${t.amountCents} is null or cast(${t.amountCents} as integer)=${t.amountCents})`,
    ),
    check('bank_refund_state', sql`${t.status} in ('completed','cancelled')`),
  ],
)
export const bankRefundAllocations = sqliteTable(
  'bank_refund_allocations',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    refundId: text('refund_id').notNull(),
    categoryId: text('category_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
  },
  (t) => [
    uniqueIndex('bank_refund_category_once').on(t.refundId, t.categoryId),
    foreignKey({
      columns: [t.refundId, t.householdId],
      foreignColumns: [bankRefunds.id, bankRefunds.householdId],
    }),
    foreignKey({
      columns: [t.categoryId, t.householdId],
      foreignColumns: [expenseCategories.id, expenseCategories.householdId],
    }),
    check(
      'bank_refund_allocation_amount',
      sql`(${t.amountCents}>0 and ${t.amountCents}<=9007199254740991) and (${t.amountCents} is null or cast(${t.amountCents} as integer)=${t.amountCents})`,
    ),
  ],
)
export const bankTransfers = sqliteTable(
  'bank_transfers',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('bank_transfer_home_id').on(t.id, t.householdId)],
)
export const bankTransferLegs = sqliteTable(
  'bank_transfer_legs',
  {
    transactionId: text('transaction_id').primaryKey(),
    householdId: text('household_id').notNull(),
    transferId: text('transfer_id').notNull(),
    direction: text('direction').notNull(),
  },
  (t) => [
    uniqueIndex('bank_transfer_direction_once').on(t.transferId, t.direction),
    foreignKey({
      columns: [t.transferId, t.householdId],
      foreignColumns: [bankTransfers.id, bankTransfers.householdId],
    }),
    foreignKey({
      columns: [t.transactionId, t.householdId],
      foreignColumns: [bankTransactions.id, bankTransactions.householdId],
    }),
    check('bank_transfer_direction', sql`${t.direction} in ('inflow','outflow')`),
  ],
)
export const bankReconciliations = sqliteTable(
  'bank_reconciliations',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    transactionId: text('transaction_id').notNull(),
    classification: text('classification').notNull(),
    expenseId: text('expense_id'),
    incomeId: text('income_id'),
    debtPaymentId: text('debt_payment_id'),
    billPaymentId: text('bill_payment_id'),
    refundId: text('refund_id'),
    transferId: text('transfer_id'),
    transactionRevision: integer('transaction_revision').notNull(),
    targetFingerprint: text('target_fingerprint'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('bank_reconcile_once').on(t.transactionId),
    uniqueIndex('bank_expense_authority_once').on(t.expenseId),
    uniqueIndex('bank_income_authority_once').on(t.incomeId),
    uniqueIndex('bank_debt_payment_authority_once').on(t.debtPaymentId),
    uniqueIndex('bank_bill_payment_authority_once').on(t.billPaymentId),
    uniqueIndex('bank_refund_authority_once').on(t.refundId),
    foreignKey({
      columns: [t.transactionId, t.householdId],
      foreignColumns: [bankTransactions.id, bankTransactions.householdId],
    }),
    foreignKey({
      columns: [t.expenseId, t.householdId],
      foreignColumns: [expenses.id, expenses.householdId],
    }),
    foreignKey({
      columns: [t.incomeId, t.householdId],
      foreignColumns: [incomeTransactions.id, incomeTransactions.householdId],
    }),
    foreignKey({
      columns: [t.debtPaymentId, t.householdId],
      foreignColumns: [debtPayments.id, debtPayments.householdId],
    }),
    foreignKey({
      columns: [t.billPaymentId, t.householdId],
      foreignColumns: [billPayments.id, billPayments.householdId],
    }),
    foreignKey({
      columns: [t.refundId, t.householdId],
      foreignColumns: [bankRefunds.id, bankRefunds.householdId],
    }),
    foreignKey({
      columns: [t.transferId, t.householdId],
      foreignColumns: [bankTransfers.id, bankTransfers.householdId],
    }),
    check(
      'bank_reconcile_kind',
      sql`${t.classification} in ('expense','bill_payment','debt_payment','income','transfer','refund','fee','ignore')`,
    ),
    check(
      'bank_reconcile_target',
      sql`(case when ${t.expenseId} is null then 0 else 1 end)+(case when ${t.incomeId} is null then 0 else 1 end)+(case when ${t.debtPaymentId} is null then 0 else 1 end)+(case when ${t.billPaymentId} is null then 0 else 1 end)+(case when ${t.refundId} is null then 0 else 1 end)+(case when ${t.transferId} is null then 0 else 1 end)=(case when ${t.classification}='ignore' then 0 else 1 end)`,
    ),
  ],
)
export const bankReviewRequests = sqliteTable(
  'bank_review_requests',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    transactionId: text('transaction_id').notNull(),
    transactionRevision: integer('transaction_revision').notNull(),
    proposalJson: text('proposal_json').notNull(),
    targetFingerprint: text('target_fingerprint').notNull(),
    status: text('status').notNull(),
    proposedByUserId: text('proposed_by_user_id')
      .notNull()
      .references(() => users.id),
    reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
    reviewedAt: text('reviewed_at'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('bank_review_submission').on(t.householdId, t.idempotencyKey),
    uniqueIndex('bank_review_pending_once')
      .on(t.transactionId)
      .where(sql`${t.status}='pending'`),
    foreignKey({
      columns: [t.transactionId, t.householdId],
      foreignColumns: [bankTransactions.id, bankTransactions.householdId],
    }),
    index('bank_review_home').on(t.householdId, t.status),
    check('bank_review_state', sql`${t.status} in ('pending','approved','rejected','cancelled')`),
  ],
)
