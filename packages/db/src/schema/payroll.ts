import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { users } from './users'
import { incomeSources, incomeTransactions } from './income'
const base = () => ({
  id: text('id').primaryKey(),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  sourceId: text('source_id').notNull(),
  createdAt: text('created_at').notNull(),
})
// All operational dates are date-only ISO strings; audit/model timestamps are UTC ISO-8601.
export const payrollProfiles = sqliteTable(
  'payroll_profiles',
  {
    ...base(),
    valuesJson: text('values_json').notNull(),
    revision: integer('revision').notNull().default(1),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('payroll_profile_source').on(t.householdId, t.sourceId),
    foreignKey({
      columns: [t.sourceId, t.householdId],
      foreignColumns: [incomeSources.id, incomeSources.householdId],
    }),
  ],
)
export const payrollWeeks = sqliteTable(
  'payroll_weeks',
  {
    ...base(),
    workweekStart: text('workweek_start').notNull(),
    workweekEnd: text('workweek_end').notNull(),
    hoursJson: text('hours_json').notNull(),
    profileSnapshotJson: text('profile_snapshot_json').notNull(),
    stage: text('stage').notNull(),
    revision: integer('revision').notNull().default(1),
    incomeTransactionId: text('income_transaction_id'),
    statementId: text('statement_id'),
    statementReceivedAt: text('statement_received_at'),
    reviewedAt: text('reviewed_at'),
    updatedAt: text('updated_at').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    uniqueIndex('payroll_week_scope').on(t.id, t.householdId),
    uniqueIndex('payroll_week_period').on(t.householdId, t.sourceId, t.workweekStart),
    uniqueIndex('payroll_week_submission').on(t.householdId, t.idempotencyKey),
    uniqueIndex('payroll_week_income').on(t.incomeTransactionId),
    foreignKey({
      columns: [t.sourceId, t.householdId],
      foreignColumns: [incomeSources.id, incomeSources.householdId],
    }),
    foreignKey({
      columns: [t.incomeTransactionId, t.householdId],
      foreignColumns: [incomeTransactions.id, incomeTransactions.householdId],
    }),
    check(
      'payroll_stage',
      sql`${t.stage} in ('hours_draft','hours_submitted','payroll_pending','paystub_received','paystub_reviewed','deposit_confirmed')`,
    ),
  ],
)
export const payrollStatements = sqliteTable(
  'payroll_statements',
  {
    ...base(),
    weekId: text('week_id').notNull(),
    headerJson: text('header_json').notNull(),
    documentDigest: text('document_digest'),
    grossCents: integer('gross_cents').notNull(),
    deductionsCents: integer('deductions_cents').notNull(),
    netCents: integer('net_cents').notNull(),
    reviewedByUserId: text('reviewed_by_user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    uniqueIndex('payroll_statement_scope').on(t.id, t.householdId),
    uniqueIndex('payroll_document_unique').on(t.householdId, t.documentDigest),
    foreignKey({
      columns: [t.weekId, t.householdId],
      foreignColumns: [payrollWeeks.id, payrollWeeks.householdId],
    }),
    foreignKey({
      columns: [t.sourceId, t.householdId],
      foreignColumns: [incomeSources.id, incomeSources.householdId],
    }),
    check(
      'payroll_statement_money',
      sql`${t.grossCents}>=0 and ${t.deductionsCents}>=0 and ${t.netCents}>=0 and ${t.grossCents}<=9007199254740991 and ${t.deductionsCents}<=9007199254740991 and ${t.netCents}<=9007199254740991`,
    ),
  ],
)
export const payrollLines = sqliteTable(
  'payroll_lines',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    statementId: text('statement_id').notNull(),
    position: integer('position').notNull(),
    label: text('label').notNull(),
    side: text('side').notNull(),
    code: text('code').notNull(),
    treatment: text('treatment').notNull(),
    currentCents: integer('current_cents'),
    ytdCents: integer('ytd_cents'),
    rateCents: integer('rate_cents'),
    hoursHundredths: integer('hours_hundredths'),
    worked: integer('worked', { mode: 'boolean' }),
    confidence: text('confidence').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.statementId, t.householdId],
      foreignColumns: [payrollStatements.id, payrollStatements.householdId],
    }),
    uniqueIndex('payroll_line_order').on(t.statementId, t.position),
    check(
      'payroll_line_side',
      sql`${t.side} in ('earnings','deduction','employer_tax','informational')`,
    ),
    check(
      'payroll_line_money',
      sql`(${t.currentCents} is null or (abs(${t.currentCents})<=9007199254740991 and cast(${t.currentCents} as integer)=${t.currentCents})) and (${t.ytdCents} is null or (abs(${t.ytdCents})<=9007199254740991 and cast(${t.ytdCents} as integer)=${t.ytdCents}))`,
    ),
  ],
)
export const payrollModels = sqliteTable(
  'payroll_models',
  {
    ...base(),
    version: integer('version').notNull(),
    observationsJson: text('observations_json').notNull(),
  },
  (t) => [
    uniqueIndex('payroll_model_version').on(t.householdId, t.sourceId, t.version),
    foreignKey({
      columns: [t.sourceId, t.householdId],
      foreignColumns: [incomeSources.id, incomeSources.householdId],
    }),
  ],
)
export const payrollForecasts = sqliteTable(
  'payroll_forecasts',
  {
    ...base(),
    weekId: text('week_id').notNull(),
    modelVersion: integer('model_version').notNull(),
    hoursRevision: integer('hours_revision').notNull(),
    resultJson: text('result_json').notNull(),
    eligibleForAccuracy: integer('eligible_for_accuracy', { mode: 'boolean' }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.weekId, t.householdId],
      foreignColumns: [payrollWeeks.id, payrollWeeks.householdId],
    }),
    foreignKey({
      columns: [t.sourceId, t.householdId],
      foreignColumns: [incomeSources.id, incomeSources.householdId],
    }),
    index('payroll_forecast_week').on(t.householdId, t.weekId, t.createdAt),
  ],
)
export const payrollAudit = sqliteTable(
  'payroll_audit',
  {
    ...base(),
    weekId: text('week_id'),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.sourceId, t.householdId],
      foreignColumns: [incomeSources.id, incomeSources.householdId],
    }),
    foreignKey({
      columns: [t.weekId, t.householdId],
      foreignColumns: [payrollWeeks.id, payrollWeeks.householdId],
    }),
    index('payroll_audit_source').on(t.householdId, t.sourceId, t.createdAt),
  ],
)
export const payrollUploadReceipts = sqliteTable(
  'payroll_upload_receipts',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    documentDigest: text('document_digest').notNull(),
    receivedAt: text('received_at').notNull(),
  },
  (t) => [
    uniqueIndex('payroll_upload_receipt_document').on(
      t.householdId,
      t.actorUserId,
      t.documentDigest,
    ),
    index('payroll_upload_receipt_actor').on(t.householdId, t.actorUserId, t.receivedAt),
  ],
)
