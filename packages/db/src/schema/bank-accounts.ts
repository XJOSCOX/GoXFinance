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
import { assets } from './assets'
import { debts } from './debts'
export const bankConnections = sqliteTable(
  'bank_connections',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    environment: text('environment').notNull(),
    providerItemId: text('provider_item_id').notNull(),
    institutionId: text('institution_id'),
    institution: text('institution').notNull(),
    tokenCiphertext: text('token_ciphertext'),
    tokenKeyId: text('token_key_id'),
    cursor: text('cursor'),
    status: text('status').notNull(),
    errorCode: text('error_code'),
    lastSyncAt: text('last_sync_at'),
    revision: integer('revision').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('bank_connection_home_id').on(t.id, t.householdId),
    uniqueIndex('bank_provider_item_unique').on(t.environment, t.providerItemId),
    index('bank_connection_home').on(t.householdId),
    check('bank_environment', sql`${t.environment} in ('sandbox','production')`),
    check(
      'bank_connection_state',
      sql`${t.status} in ('active','disabled','error','reauth_required','disconnected')`,
    ),
    check('bank_token_pair', sql`(${t.tokenCiphertext} is null) = (${t.tokenKeyId} is null)`),
    check('bank_connection_revision', sql`${t.revision}>0`),
  ],
)
export const bankAccounts = sqliteTable(
  'bank_accounts',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    connectionId: text('connection_id'),
    providerAccountId: text('provider_account_id'),
    name: text('name').notNull(),
    institution: text('institution').notNull(),
    type: text('type').notNull(),
    subtype: text('subtype'),
    mask: text('mask'),
    currency: text('currency'),
    status: text('status').notNull(),
    assetId: text('asset_id'),
    debtId: text('debt_id'),
    revision: integer('revision').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('bank_account_home_id').on(t.id, t.householdId),
    uniqueIndex('bank_provider_account_unique').on(t.connectionId, t.providerAccountId),
    uniqueIndex('bank_account_submit').on(t.householdId, t.idempotencyKey),
    index('bank_account_home_state').on(t.householdId, t.status),
    foreignKey({
      columns: [t.connectionId, t.householdId],
      foreignColumns: [bankConnections.id, bankConnections.householdId],
    }),
    foreignKey({
      columns: [t.assetId, t.householdId],
      foreignColumns: [assets.id, assets.householdId],
    }),
    foreignKey({
      columns: [t.debtId, t.householdId],
      foreignColumns: [debts.id, debts.householdId],
    }),
    uniqueIndex('bank_asset_link_once').on(t.assetId),
    uniqueIndex('bank_debt_link_once').on(t.debtId),
    check(
      'bank_account_type',
      sql`${t.type} in ('checking','savings','credit_card','other_depository')`,
    ),
    check('bank_account_state', sql`${t.status} in ('active','hidden')`),
    check('bank_mask_length', sql`${t.mask} is null or length(${t.mask}) between 1 and 4`),
    check(
      'bank_link_kind',
      sql`(${t.assetId} is null or ${t.type}<>'credit_card') and (${t.debtId} is null or ${t.type}='credit_card')`,
    ),
    check('bank_account_revision', sql`${t.revision}>0`),
  ],
)
export const bankAccountMembers = sqliteTable(
  'bank_account_members',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    accountId: text('account_id').notNull(),
    memberId: text('member_id').notNull(),
  },
  (t) => [
    uniqueIndex('bank_member_access_once').on(t.accountId, t.memberId),
    foreignKey({
      columns: [t.accountId, t.householdId],
      foreignColumns: [bankAccounts.id, bankAccounts.householdId],
    }),
    foreignKey({
      columns: [t.memberId, t.householdId],
      foreignColumns: [householdMembers.id, householdMembers.householdId],
    }),
  ],
)
export const bankBalanceObservations = sqliteTable(
  'bank_balance_observations',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    accountId: text('account_id').notNull(),
    currentCents: integer('current_cents'),
    availableCents: integer('available_cents'),
    observedAt: text('observed_at').notNull(),
    institutionAsOf: text('institution_as_of'),
    source: text('source').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.accountId, t.householdId],
      foreignColumns: [bankAccounts.id, bankAccounts.householdId],
    }),
    uniqueIndex('bank_balance_submit').on(t.accountId, t.idempotencyKey),
    index('bank_balance_date').on(t.accountId, t.observedAt),
    check(
      'bank_current_safe',
      sql`(${t.currentCents} is null or ${t.currentCents} between -9007199254740991 and 9007199254740991) and (${t.currentCents} is null or cast(${t.currentCents} as integer)=${t.currentCents})`,
    ),
    check(
      'bank_available_safe',
      sql`(${t.availableCents} is null or ${t.availableCents} between -9007199254740991 and 9007199254740991) and (${t.availableCents} is null or cast(${t.availableCents} as integer)=${t.availableCents})`,
    ),
    check('bank_observation_source', sql`${t.source} in ('manual','plaid_cached')`),
  ],
)
export const plaidLinkAttempts = sqliteTable(
  'plaid_link_attempts',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    environment: text('environment').notNull(),
    intent: text('intent').notNull(),
    connectionId: text('connection_id'),
    status: text('status').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    publicTokenHash: text('public_token_hash'),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('plaid_attempt_submit').on(t.householdId, t.idempotencyKey),
    index('plaid_lifetime_usage').on(t.environment, t.intent),
    foreignKey({
      columns: [t.connectionId, t.householdId],
      foreignColumns: [bankConnections.id, bankConnections.householdId],
    }),
    check('plaid_attempt_intent', sql`${t.intent} in ('connect','update')`),
    check('plaid_attempt_state', sql`${t.status} in ('reserved','exchanged','uncertain','failed')`),
    check('plaid_attempt_environment', sql`${t.environment} in ('sandbox','production')`),
  ],
)
