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
import { bankAccounts } from './bank-accounts'
import { users } from './users'
import { households } from './households'
import { expenseCategories } from './categories'
export const bankImportBatches = sqliteTable(
  'bank_import_batches',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    accountId: text('account_id').notNull(),
    source: text('source').notNull(),
    sourceHash: text('source_hash').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    recordCount: integer('record_count').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('bank_batch_home_id').on(t.id, t.householdId),
    uniqueIndex('bank_batch_submit').on(t.householdId, t.idempotencyKey),
    foreignKey({
      columns: [t.accountId, t.householdId],
      foreignColumns: [bankAccounts.id, bankAccounts.householdId],
    }),
  ],
)
export const bankTransactions = sqliteTable(
  'bank_transactions',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    accountId: text('account_id').notNull(),
    source: text('source').notNull(),
    providerTransactionId: text('provider_transaction_id'),
    fingerprint: text('fingerprint').notNull(),
    batchId: text('batch_id'),
    date: text('date').notNull(),
    authorizedDate: text('authorized_date'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency'),
    pending: integer('pending', { mode: 'boolean' }).notNull(),
    pendingProviderId: text('pending_provider_id'),
    replacedById: text('replaced_by_id'),
    removed: integer('removed', { mode: 'boolean' }).notNull(),
    merchant: text('merchant'),
    description: text('description').notNull(),
    reviewStatus: text('review_status').notNull(),
    revision: integer('revision').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('bank_transaction_home_id').on(t.id, t.householdId),
    uniqueIndex('bank_provider_transaction_once').on(t.accountId, t.providerTransactionId),
    uniqueIndex('bank_import_fingerprint_once').on(t.accountId, t.fingerprint),
    index('bank_inbox').on(t.householdId, t.reviewStatus, t.date),
    foreignKey({
      columns: [t.accountId, t.householdId],
      foreignColumns: [bankAccounts.id, bankAccounts.householdId],
    }),
    foreignKey({
      columns: [t.batchId, t.householdId],
      foreignColumns: [bankImportBatches.id, bankImportBatches.householdId],
    }),
    check(
      'bank_transaction_amount',
      sql`(${t.amountCents}<>0 and ${t.amountCents} between -9007199254740991 and 9007199254740991) and (${t.amountCents} is null or cast(${t.amountCents} as integer)=${t.amountCents})`,
    ),
    check(
      'bank_transaction_state',
      sql`${t.reviewStatus} in ('unreviewed','reconciled','ignored','needs_review','superseded')`,
    ),
    check('bank_transaction_source', sql`${t.source} in ('csv','ofx','plaid')`),
    check('bank_transaction_revision', sql`${t.revision}>0`),
  ],
)
export const bankAudit = sqliteTable(
  'bank_audit',
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
    detailsJson: text('details_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('bank_audit_target').on(t.householdId, t.targetId, t.createdAt)],
)
export const bankMerchantRules = sqliteTable(
  'bank_merchant_rules',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    accountId: text('account_id').notNull(),
    merchant: text('merchant').notNull(),
    classification: text('classification').notNull(),
    categoryId: text('category_id').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('bank_merchant_rule_once').on(t.accountId, t.merchant),
    foreignKey({
      columns: [t.accountId, t.householdId],
      foreignColumns: [bankAccounts.id, bankAccounts.householdId],
    }),
    foreignKey({
      columns: [t.categoryId, t.householdId],
      foreignColumns: [expenseCategories.id, expenseCategories.householdId],
    }),
    check('bank_rule_kind', sql`${t.classification} in ('expense','fee')`),
  ],
)
