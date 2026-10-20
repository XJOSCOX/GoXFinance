import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  foreignKey,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/sqlite-core'
import { households } from './households'
import { users } from './users'
import { debts } from './debts'
import { debtPayments } from './debt-payments'
export const settlementOffers = sqliteTable(
  'settlement_offers',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    debtId: text('debt_id').notNull(),
    valuesJson: text('values_json').notNull(),
    revision: integer('revision').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('settlement_offer_home').on(t.id, t.householdId, t.debtId),
    uniqueIndex('settlement_submission').on(t.householdId, t.idempotencyKey),
    index('settlement_debt').on(t.householdId, t.debtId),
    foreignKey({
      columns: [t.debtId, t.householdId],
      foreignColumns: [debts.id, debts.householdId],
    }),
    check('settlement_revision', sql`${t.revision} > 0`),
  ],
)
export const settlementInstallments = sqliteTable(
  'settlement_installments',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    offerId: text('offer_id').notNull(),
    debtId: text('debt_id').notNull(),
    dueDate: text('due_date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    paymentId: text('payment_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('settlement_schedule').on(t.householdId, t.offerId, t.dueDate),
    uniqueIndex('settlement_payment_once').on(t.paymentId),
    foreignKey({
      columns: [t.offerId, t.householdId, t.debtId],
      foreignColumns: [settlementOffers.id, settlementOffers.householdId, settlementOffers.debtId],
    }),
    foreignKey({
      columns: [t.paymentId, t.householdId, t.debtId],
      foreignColumns: [debtPayments.id, debtPayments.householdId, debtPayments.debtId],
    }),
    check(
      'settlement_amount',
      sql`${t.amountCents} >= 0 and ${t.amountCents} <= 9007199254740991 and cast(${t.amountCents} as integer) = ${t.amountCents}`,
    ),
  ],
)
export const payoffScenarios = sqliteTable(
  'debt_payoff_scenarios',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    inputJson: text('input_json').notNull(),
    debtSnapshotJson: text('debt_snapshot_json').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('payoff_submission').on(t.householdId, t.idempotencyKey),
    index('payoff_history').on(t.householdId, t.createdAt),
  ],
)
export const planningAudit = sqliteTable(
  'debt_planning_audit',
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
    beforeJson: text('before_json'),
    afterJson: text('after_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('planning_audit_target').on(t.householdId, t.targetId, t.createdAt)],
)
