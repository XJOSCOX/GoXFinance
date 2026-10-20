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
import { debts } from './debts'
export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    name: text('name').notNull(),
    category: text('category').notNull(),
    acquisitionDate: text('acquisition_date'),
    purchaseCents: integer('purchase_cents'),
    notes: text('notes'),
    status: text('status').notNull(),
    revision: integer('revision').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('asset_home_id').on(t.id, t.householdId),
    uniqueIndex('asset_submission').on(t.householdId, t.idempotencyKey),
    index('asset_status_home').on(t.householdId, t.status),
    check(
      'asset_purchase_cents',
      sql`${t.purchaseCents} is null or (${t.purchaseCents} >= 0 and ${t.purchaseCents} <= 9007199254740991 and cast(${t.purchaseCents} as integer)=${t.purchaseCents})`,
    ),
    check('asset_status', sql`${t.status} in ('active','archived')`),
  ],
)
export const assetMembers = sqliteTable(
  'asset_members',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    assetId: text('asset_id').notNull(),
    memberId: text('member_id').notNull(),
  },
  (t) => [
    uniqueIndex('asset_member_once').on(t.assetId, t.memberId),
    foreignKey({
      columns: [t.assetId, t.householdId],
      foreignColumns: [assets.id, assets.householdId],
    }),
    foreignKey({
      columns: [t.memberId, t.householdId],
      foreignColumns: [householdMembers.id, householdMembers.householdId],
    }),
  ],
)
export const assetDebtLinks = sqliteTable(
  'asset_debt_links',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    assetId: text('asset_id').notNull(),
    debtId: text('debt_id').notNull(),
  },
  (t) => [
    uniqueIndex('asset_debt_once').on(t.assetId, t.debtId),
    foreignKey({
      columns: [t.assetId, t.householdId],
      foreignColumns: [assets.id, assets.householdId],
    }),
    foreignKey({
      columns: [t.debtId, t.householdId],
      foreignColumns: [debts.id, debts.householdId],
    }),
  ],
)
export const assetValuations = sqliteTable(
  'asset_valuations',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    assetId: text('asset_id').notNull(),
    valueCents: integer('value_cents'),
    valuationDate: text('valuation_date').notNull(),
    source: text('source').notNull(),
    confidence: text('confidence').notNull(),
    notes: text('notes'),
    supersedesId: text('supersedes_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    recordedByUserId: text('recorded_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('valuation_submission').on(t.householdId, t.idempotencyKey),
    uniqueIndex('valuation_asset_home').on(t.id, t.assetId, t.householdId),
    uniqueIndex('valuation_supersedes_once').on(t.supersedesId),
    index('valuation_date').on(t.householdId, t.assetId, t.valuationDate),
    foreignKey({
      columns: [t.assetId, t.householdId],
      foreignColumns: [assets.id, assets.householdId],
    }),
    foreignKey({
      columns: [t.supersedesId, t.assetId, t.householdId],
      foreignColumns: [t.id, t.assetId, t.householdId],
    }),
    check(
      'valuation_cents',
      sql`${t.valueCents} is null or (${t.valueCents} between -9007199254740991 and 9007199254740991 and cast(${t.valueCents} as integer)=${t.valueCents})`,
    ),
  ],
)
export const assetAudit = sqliteTable(
  'asset_audit',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    assetId: text('asset_id').notNull(),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('asset_audit_target').on(t.householdId, t.assetId, t.createdAt),
    foreignKey({
      columns: [t.assetId, t.householdId],
      foreignColumns: [assets.id, assets.householdId],
    }),
  ],
)
export const netWorthSnapshots = sqliteTable(
  'net_worth_snapshots',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    reportJson: text('report_json').notNull(),
    sourcesJson: text('sources_json').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('net_worth_submission').on(t.householdId, t.idempotencyKey),
    index('net_worth_history').on(t.householdId, t.createdAt),
  ],
)
