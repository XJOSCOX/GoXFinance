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
import { incomeSources, incomeTransactions } from './income'

export const tradingAccounts = sqliteTable(
  'trading_accounts',
  {
    ...owner(),
    responsibleMemberId: text('responsible_member_id').notNull(),
    provider: text('provider').notNull(),
    nickname: text('nickname').notNull(),
    maskedExternalId: text('masked_external_id'),
    stage: text('stage').notNull(),
    xfaPath: text('xfa_path').notNull(),
    tierCents: integer('tier_cents'),
    reportedBalanceCents: integer('reported_balance_cents'),
    maximumLossCents: integer('maximum_loss_cents'),
    dailyLossCents: integer('daily_loss_cents'),
    activationDate: text('activation_date'),
    status: text('status').notNull(),
    timezone: text('timezone').notNull(),
    sessionStart: text('session_start').notNull(),
    notes: text('notes'),
    incomeSourceId: text('income_source_id'),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('trading_account_scope').on(t.id, t.householdId),
    uniqueIndex('trading_account_submission').on(t.householdId, t.idempotencyKey),
    index('trading_account_member').on(t.householdId, t.responsibleMemberId),
    foreignKey({
      columns: [t.responsibleMemberId, t.householdId],
      foreignColumns: [householdMembers.id, householdMembers.householdId],
    }),
    foreignKey({
      columns: [t.incomeSourceId, t.householdId],
      foreignColumns: [incomeSources.id, incomeSources.householdId],
    }),
    check('trading_provider', sql`${t.provider} = 'Topstep'`),
    check('trading_stage', sql`${t.stage} in ('combine','xfa','lfa')`),
    check(
      'trading_path',
      sql`${t.xfaPath} in ('standard','consistency','not_applicable') and (${t.stage} = 'xfa' or ${t.xfaPath} = 'not_applicable')`,
    ),
    check('trading_status', sql`${t.status} in ('active','passed','failed','closed','paused')`),
    check(
      'trading_limits',
      sql`(${t.tierCents} is null or ${t.tierCents} >= 0) and (${t.maximumLossCents} is null or ${t.maximumLossCents} >= 0) and (${t.dailyLossCents} is null or ${t.dailyLossCents} >= 0)`,
    ),
  ],
)
export const tradingResults = sqliteTable(
  'trading_results',
  {
    ...owner(),
    accountId: text('account_id').notNull(),
    sessionAt: text('session_at').notNull(),
    sessionDate: text('session_date').notNull(),
    timezone: text('timezone').notNull(),
    sessionStart: text('session_start').notNull(),
    grossCents: integer('gross_cents').notNull(),
    profitCents: integer('profit_cents'),
    lossCents: integer('loss_cents'),
    feesCents: integer('fees_cents').notNull(),
    netCents: integer('net_cents').notNull(),
    tradeCount: integer('trade_count'),
    notes: text('notes'),
  },
  (t) => [
    uniqueIndex('trading_result_submission').on(t.householdId, t.idempotencyKey),
    uniqueIndex('trading_daily_summary').on(t.accountId, t.sessionDate),
    index('trading_result_date').on(t.householdId, t.sessionDate),
    foreignKey({
      columns: [t.accountId, t.householdId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.householdId],
    }),
    check(
      'trading_result_math',
      sql`${t.feesCents} >= 0 and ${t.netCents} = ${t.grossCents} - ${t.feesCents}`,
    ),
    check('trading_trade_count', sql`${t.tradeCount} is null or ${t.tradeCount} >= 0`),
  ],
)
export const tradingPayouts = sqliteTable(
  'trading_payouts',
  {
    ...owner(),
    batchId: text('batch_id').references(() => tradingPayoutBatches.id),
    accountId: text('account_id').notNull(),
    requestedCents: integer('requested_cents').notNull(),
    requestDate: text('request_date').notNull(),
    status: text('status').notNull(),
    approvedCents: integer('approved_cents'),
    receivedCents: integer('received_cents'),
    depositDate: text('deposit_date'),
    reference: text('reference'),
    notes: text('notes'),
    receiptConfirmed: integer('receipt_confirmed', { mode: 'boolean' }).notNull(),
    existingIncomeTransactionId: text('existing_income_transaction_id'),
    incomeTransactionId: text('income_transaction_id'),
  },
  (t) => [
    uniqueIndex('trading_payout_submission').on(t.householdId, t.idempotencyKey),
    uniqueIndex('trading_payout_reference').on(t.householdId, t.reference),
    uniqueIndex('trading_payout_income').on(t.incomeTransactionId),
    index('trading_payout_date').on(t.householdId, t.requestDate),
    foreignKey({
      columns: [t.accountId, t.householdId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.householdId],
    }),
    foreignKey({
      columns: [t.incomeTransactionId, t.householdId],
      foreignColumns: [incomeTransactions.id, incomeTransactions.householdId],
    }),
    foreignKey({
      columns: [t.existingIncomeTransactionId, t.householdId],
      foreignColumns: [incomeTransactions.id, incomeTransactions.householdId],
    }),
    check(
      'trading_payout_status',
      sql`${t.status} in ('requested','approved','rejected','paid','cancelled')`,
    ),
    check(
      'trading_payout_money',
      sql`${t.requestedCents} > 0 and (${t.approvedCents} is null or ${t.approvedCents} >= 0) and (${t.receivedCents} is null or ${t.receivedCents} >= 0)`,
    ),
    check(
      'trading_payout_receipt',
      sql`(${t.status} = 'paid' and ${t.receivedCents} is not null and ${t.depositDate} is not null and ${t.incomeTransactionId} is not null and ${t.receiptConfirmed} = 1) or (${t.status} <> 'paid' and ${t.receivedCents} is null and ${t.depositDate} is null and ${t.incomeTransactionId} is null and ${t.receiptConfirmed} = 0)`,
    ),
  ],
)
export const tradingRuleSnapshots = sqliteTable(
  'trading_rule_snapshots',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    accountId: text('account_id').notNull(),
    rulesJson: text('rules_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.accountId, t.householdId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.householdId],
    }),
    index('trading_rules_account').on(t.householdId, t.accountId, t.createdAt),
  ],
)
export const tradingAudit = sqliteTable(
  'trading_audit',
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
  (t) => [index('trading_audit_target').on(t.householdId, t.targetId, t.createdAt)],
)

export const copyGroups = sqliteTable(
  'copy_groups',
  {
    ...owner(),
    name: text('name').notNull(),
    leadAccountId: text('lead_account_id').notNull(),
    status: text('status').notNull(),
  },
  (t) => [
    uniqueIndex('copy_group_scope').on(t.id, t.householdId),
    uniqueIndex('copy_group_submission').on(t.householdId, t.idempotencyKey),
    foreignKey({
      columns: [t.leadAccountId, t.householdId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.householdId],
    }),
    check('copy_group_status', sql`${t.status} in ('active','inactive')`),
  ],
)
export const copyGroupMembers = sqliteTable(
  'copy_group_members',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    groupId: text('group_id').notNull(),
    accountId: text('account_id').notNull(),
    quantityMultiplier: text('quantity_multiplier').notNull(),
  },
  (t) => [
    uniqueIndex('copy_group_member').on(t.groupId, t.accountId),
    foreignKey({
      columns: [t.groupId, t.householdId],
      foreignColumns: [copyGroups.id, copyGroups.householdId],
    }),
    foreignKey({
      columns: [t.accountId, t.householdId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.householdId],
    }),
  ],
)
export const copyEvents = sqliteTable(
  'copy_events',
  {
    ...owner(),
    groupId: text('group_id').notNull(),
    sessionAt: text('session_at').notNull(),
    mode: text('mode').notNull(),
    instrument: text('instrument'),
    direction: text('direction'),
    notes: text('notes'),
    membershipJson: text('membership_json').notNull(),
  },
  (t) => [
    uniqueIndex('copy_event_scope').on(t.id, t.householdId),
    uniqueIndex('copy_event_submission').on(t.householdId, t.idempotencyKey),
    foreignKey({
      columns: [t.groupId, t.householdId],
      foreignColumns: [copyGroups.id, copyGroups.householdId],
    }),
    check('copy_event_mode', sql`${t.mode} in ('trade','daily')`),
  ],
)
export const copyEventResults = sqliteTable(
  'copy_event_results',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    eventId: text('event_id').notNull(),
    accountId: text('account_id').notNull(),
    quantity: text('quantity').notNull(),
    grossCents: integer('gross_cents').notNull(),
    feesCents: integer('fees_cents').notNull(),
    netCents: integer('net_cents').notNull(),
    sessionDate: text('session_date').notNull(),
    timezone: text('timezone').notNull(),
    sessionStart: text('session_start').notNull(),
  },
  (t) => [
    uniqueIndex('copy_event_account').on(t.eventId, t.accountId),
    index('copy_result_date').on(t.householdId, t.accountId, t.sessionDate),
    foreignKey({
      columns: [t.eventId, t.householdId],
      foreignColumns: [copyEvents.id, copyEvents.householdId],
    }),
    foreignKey({
      columns: [t.accountId, t.householdId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.householdId],
    }),
    check(
      'copy_result_math',
      sql`${t.feesCents} >= 0 and ${t.netCents} = ${t.grossCents} - ${t.feesCents}`,
    ),
  ],
)
export const tradingPayoutBatches = sqliteTable(
  'trading_payout_batches',
  {
    ...owner(),
    name: text('name').notNull(),
    requestDate: text('request_date').notNull(),
    notes: text('notes'),
  },
  (t) => [uniqueIndex('payout_batch_submission').on(t.householdId, t.idempotencyKey)],
)
