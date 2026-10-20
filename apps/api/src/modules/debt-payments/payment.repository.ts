import { randomUUID } from 'node:crypto'
import { guardBankReference } from '../../db/financial-reference-guard'
import { billPaymentRefunds } from '../banking/reconciliation/refund-source'
import { and, desc, eq } from 'drizzle-orm'
import type { DebtPaymentValues } from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
import {
  debtBalanceHistory,
  debtPaymentAudit,
  debtPayments,
  debts,
} from '../../../../../packages/db/src/schema'

type PaymentRow = typeof debtPayments.$inferSelect
type PaymentChanges = Partial<
  Pick<
    PaymentRow,
    | 'amountCents'
    | 'paymentDate'
    | 'paymentStatus'
    | 'paymentMethod'
    | 'principalAmountCents'
    | 'interestAmountCents'
    | 'feesAmountCents'
    | 'referenceNumber'
    | 'notes'
  >
>
type BalanceValues = {
  balanceCents: number
  effectiveDate: string
  source: 'creditor_statement' | 'reconciliation'
  notes: string | null
  idempotencyKey?: string
}

export function paymentRepository(db: DatabaseConnection) {
  const debtKey = (householdId: string, debtId: string) =>
    and(eq(debtPayments.householdId, householdId), eq(debtPayments.debtId, debtId))
  const paymentKey = (householdId: string, debtId: string, paymentId: string) =>
    and(debtKey(householdId, debtId), eq(debtPayments.id, paymentId))
  function audit(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    payment: PaymentRow,
    actorUserId: string,
    action: 'created' | 'edited' | 'cancelled' | 'confirmed',
    before: PaymentRow | null,
  ) {
    tx.insert(debtPaymentAudit)
      .values({
        id: randomUUID(),
        householdId: payment.householdId,
        debtId: payment.debtId,
        paymentId: payment.id,
        actorUserId,
        action,
        beforeJson: before ? JSON.stringify(before) : null,
        afterJson: JSON.stringify(payment),
        createdAt: new Date().toISOString(),
      })
      .run()
  }
  return {
    transaction<T>(operation: () => T) {
      return db.transaction(operation, { behavior: 'immediate' })
    },
    findBalanceByKey(householdId: string, debtId: string, requestKey: string) {
      return db
        .select()
        .from(debtBalanceHistory)
        .where(
          and(
            eq(debtBalanceHistory.householdId, householdId),
            eq(debtBalanceHistory.debtId, debtId),
            eq(debtBalanceHistory.requestKey, requestKey),
          ),
        )
        .get()
    },
    list(householdId: string, debtId: string) {
      return db
        .select()
        .from(debtPayments)
        .where(debtKey(householdId, debtId))
        .orderBy(desc(debtPayments.paymentDate), desc(debtPayments.createdAt))
        .all().map((p)=>({...p,refunds:billPaymentRefunds(db,householdId,p.id,p.id)}))
    },
    find(householdId: string, debtId: string, paymentId: string) {
      return db
        .select()
        .from(debtPayments)
        .where(paymentKey(householdId, debtId, paymentId))
        .get()
    },
    findByKey(householdId: string, debtId: string, idempotencyKey: string) {
      return db
        .select()
        .from(debtPayments)
        .where(and(debtKey(householdId, debtId), eq(debtPayments.idempotencyKey, idempotencyKey)))
        .get()
    },
    create(
      householdId: string,
      debtId: string,
      createdByUserId: string,
      values: DebtPaymentValues,
    ) {
      const now = new Date().toISOString()
      const payment = {
        id: randomUUID(),
        householdId,
        debtId,
        createdByUserId,
        ...values,
        createdAt: now,
        updatedAt: now,
      }
      return db.transaction((tx) => {
        tx.insert(debtPayments).values(payment).run()
        audit(tx, payment, createdByUserId, 'created', null)
        return payment
      })
    },
    update(
      householdId: string,
      debtId: string,
      paymentId: string,
      actorUserId: string,
      changes: PaymentChanges,
      action: 'edited' | 'cancelled' | 'confirmed',
    ) {
      return db.transaction((tx) => {
        const before = tx
          .select()
          .from(debtPayments)
          .where(paymentKey(householdId, debtId, paymentId))
          .get()!
        guardBankReference(db, householdId, 'debtPaymentId', paymentId)
        const after = { ...before, ...changes, updatedAt: new Date().toISOString() }
        tx.update(debtPayments)
          .set({ ...changes, updatedAt: after.updatedAt })
          .where(paymentKey(householdId, debtId, paymentId))
          .run()
        audit(tx, after, actorUserId, action, before)
        return after
      })
    },
    auditHistory(householdId: string, debtId: string, paymentId: string) {
      return db
        .select()
        .from(debtPaymentAudit)
        .where(
          and(
            eq(debtPaymentAudit.householdId, householdId),
            eq(debtPaymentAudit.debtId, debtId),
            eq(debtPaymentAudit.paymentId, paymentId),
          ),
        )
        .orderBy(debtPaymentAudit.createdAt)
        .all()
    },
    listBalances(householdId: string, debtId: string) {
      return db
        .select()
        .from(debtBalanceHistory)
        .where(
          and(
            eq(debtBalanceHistory.householdId, householdId),
            eq(debtBalanceHistory.debtId, debtId),
          ),
        )
        .orderBy(desc(debtBalanceHistory.effectiveDate), desc(debtBalanceHistory.createdAt))
        .all()
    },
    recordBalance(
      householdId: string,
      debtId: string,
      actorUserId: string,
      values: BalanceValues,
      updateCurrent: boolean,
    ) {
      const now = new Date().toISOString()
      const entry = {
        id: randomUUID(),
        householdId,
        debtId,
        recordedByUserId: actorUserId,
        balanceCents: values.balanceCents,
        effectiveDate: values.effectiveDate,
        source: values.source,
        notes: values.notes,
        requestKey: values.idempotencyKey ?? null,
        createdAt: now,
      }
      return db.transaction((tx) => {
        tx.insert(debtBalanceHistory).values(entry).run()
        if (updateCurrent)
          tx.update(debts)
            .set({
              currentBalanceCents: values.balanceCents,
              balanceVerifiedAt: `${values.effectiveDate}T00:00:00.000Z`,
              confidence: 'confirmed',
              updatedAt: now,
            })
            .where(and(eq(debts.householdId, householdId), eq(debts.id, debtId)))
            .run()
        return entry
      })
    },
  }
}

export type PaymentRepository = ReturnType<typeof paymentRepository>
