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
})
const money = (name: string) => integer(name)
export const incomeSources = sqliteTable(
  'income_sources',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    responsibleMemberId: text('responsible_member_id').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    incomeType: text('income_type').notNull(),
    frequency: text('frequency').notNull(),
    hourlyRateCents: money('hourly_rate_cents'),
    expectedGrossCents: money('expected_gross_cents'),
    expectedNetCents: money('expected_net_cents'),
    payday: integer('payday'),
    overtimeMultiplier: text('overtime_multiplier').notNull(),
    status: text('status').notNull(),
    notes: text('notes'),
    revision: integer('revision').notNull().default(1),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    idempotencyKey: text('idempotency_key').notNull(),
    ...stamps(),
  },
  (t) => [
    uniqueIndex('income_source_scope').on(t.id, t.householdId),
    uniqueIndex('income_source_submission').on(t.householdId, t.idempotencyKey),
    index('income_source_member').on(t.householdId, t.responsibleMemberId),
    foreignKey({
      columns: [t.responsibleMemberId, t.householdId],
      foreignColumns: [householdMembers.id, householdMembers.householdId],
    }),
    check(
      'income_source_type',
      sql`${t.incomeType} in ('hourly','salary','self_employment','military','benefits','trading_payout','other')`,
    ),
    check(
      'income_source_frequency',
      sql`${t.frequency} in ('weekly','biweekly','semimonthly','monthly','annually','irregular')`,
    ),
    check('income_source_status', sql`${t.status} in ('active','inactive')`),
    check('income_source_payday', sql`${t.payday} is null or ${t.payday} between 0 and 6`),
    check(
      'income_source_money',
      sql`(${t.hourlyRateCents} is null or ${t.hourlyRateCents} >= 0) and (${t.expectedGrossCents} is null or ${t.expectedGrossCents} >= 0) and (${t.expectedNetCents} is null or ${t.expectedNetCents} >= 0)`,
    ),
  ],
)
export const incomeTransactions = sqliteTable(
  'income_transactions',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    sourceId: text('source_id').notNull(),
    responsibleMemberId: text('responsible_member_id').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    incomeTypeSnapshot: text('income_type_snapshot').notNull(),
    frequencySnapshot: text('frequency_snapshot').notNull(),
    workPeriodStart: text('work_period_start'),
    workPeriodEnd: text('work_period_end'),
    regularHours: text('regular_hours'),
    overtimeHours: text('overtime_hours'),
    hourlyRateCents: money('hourly_rate_cents'),
    overtimeMultiplier: text('overtime_multiplier').notNull(),
    estimatedGrossCents: money('estimated_gross_cents'),
    expectedGrossCents: money('expected_gross_cents'),
    expectedNetCents: money('expected_net_cents'),
    actualGrossCents: money('actual_gross_cents'),
    deductionsCents: money('deductions_cents'),
    actualNetCents: money('actual_net_cents'),
    payDate: text('pay_date').notNull(),
    depositDate: text('deposit_date'),
    status: text('status').notNull(),
    reference: text('reference'),
    notes: text('notes'),
    receiptConfirmed: integer('receipt_confirmed', { mode: 'boolean' }).notNull(),
    tradingPayoutWithdrawn: integer('trading_payout_withdrawn', { mode: 'boolean' }).notNull(),
    confirmedAt: text('confirmed_at'),
    revision: integer('revision').notNull().default(1),
    paycheckKey: text('paycheck_key').notNull(),
    regularPayDate: text('regular_pay_date'),
    idempotencyKey: text('idempotency_key').notNull(),
    ...stamps(),
  },
  (t) => [
    uniqueIndex('income_transaction_scope').on(t.id, t.householdId),
    uniqueIndex('income_transaction_submission').on(t.householdId, t.idempotencyKey),
    uniqueIndex('income_paycheck_unique')
      .on(t.sourceId, t.paycheckKey)
      .where(sql`${t.status} <> 'cancelled'`),
    uniqueIndex('income_paydate_unique')
      .on(t.sourceId, t.regularPayDate)
      .where(sql`${t.status} <> 'cancelled'`),
    uniqueIndex('income_reference_unique')
      .on(t.sourceId, t.reference)
      .where(sql`${t.status} <> 'cancelled'`),
    index('income_deposit_date').on(t.householdId, t.depositDate),
    index('income_pay_date').on(t.householdId, t.payDate),
    foreignKey({
      columns: [t.sourceId, t.householdId],
      foreignColumns: [incomeSources.id, incomeSources.householdId],
    }),
    foreignKey({
      columns: [t.responsibleMemberId, t.householdId],
      foreignColumns: [householdMembers.id, householdMembers.householdId],
    }),
    check(
      'income_transaction_status',
      sql`${t.status} in ('expected','pending','confirmed','cancelled')`,
    ),
    check(
      'income_withdrawn_payout',
      sql`${t.status} <> 'confirmed' or ${t.incomeTypeSnapshot} <> 'trading_payout' or ${t.tradingPayoutWithdrawn} = 1`,
    ),
    check(
      'income_confirmation',
      sql`${t.status} <> 'confirmed' or (${t.actualNetCents} is not null and ${t.depositDate} is not null and ${t.confirmedAt} is not null and ${t.receiptConfirmed} = 1)`,
    ),
    check(
      'income_work_period',
      sql`(${t.workPeriodStart} is null and ${t.workPeriodEnd} is null) or (${t.workPeriodStart} is not null and ${t.workPeriodEnd} >= ${t.workPeriodStart})`,
    ),
    check(
      'income_transaction_money',
      sql`(${t.actualNetCents} is null or ${t.actualNetCents} >= 0) and (${t.actualGrossCents} is null or ${t.actualGrossCents} >= 0) and (${t.deductionsCents} is null or ${t.deductionsCents} >= 0) and (${t.hourlyRateCents} is null or ${t.hourlyRateCents} >= 0) and (${t.expectedNetCents} is null or ${t.expectedNetCents} >= 0) and (${t.expectedGrossCents} is null or ${t.expectedGrossCents} >= 0) and (${t.estimatedGrossCents} is null or ${t.estimatedGrossCents} >= 0)`,
    ),
  ],
)
export const incomeAudit = sqliteTable(
  'income_audit',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    sourceId: text('source_id').notNull(),
    transactionId: text('transaction_id'),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.sourceId, t.householdId],
      foreignColumns: [incomeSources.id, incomeSources.householdId],
    }),
    foreignKey({
      columns: [t.transactionId, t.householdId],
      foreignColumns: [incomeTransactions.id, incomeTransactions.householdId],
    }),
    index('income_audit_source').on(t.householdId, t.sourceId, t.createdAt),
    index('income_audit_transaction').on(t.householdId, t.transactionId, t.createdAt),
  ],
)
