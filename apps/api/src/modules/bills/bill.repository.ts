import { categoryRepository } from '../categories/category.repository'
import { billPaymentRefunds } from '../banking/reconciliation/refund-source'
import { guardBankReference } from '../../db/financial-reference-guard'
import { randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Bill, BillInput, BillPayment, BillChangeRequest } from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
import {
  bills,
  billMembers,
  billPeriods,
  billPayments,
  billAudit,
  billChangeRequests,
  debtPayments,
  debtPaymentAudit,
  users,
} from '../../../../../packages/db/src/schema'

export function billRepository(db: DatabaseConnection) {
  const key = (householdId: string, id: string) =>
    and(eq(bills.householdId, householdId), eq(bills.id, id))
  const paymentKey = (householdId: string, id: string) =>
    and(eq(billPayments.householdId, householdId), eq(billPayments.id, id))
  function hydrate(row: typeof bills.$inferSelect): Bill {
    return {
      ...row,
      memberIds: db
        .select()
        .from(billMembers)
        .where(and(eq(billMembers.householdId, row.householdId), eq(billMembers.billId, row.id)))
        .orderBy(asc(billMembers.memberId))
        .all()
        .map((item) => item.memberId),
    } as Bill
  }
  return {
    resolveCategory: (...args: Parameters<ReturnType<typeof categoryRepository>['resolveBill']>) =>
      categoryRepository(db).resolveBill(...args),
    linkedPaymentAudit(householdId: string, billId: string) {
      return db
        .select({ id: debtPaymentAudit.id })
        .from(debtPaymentAudit)
        .innerJoin(
          billPayments,
          and(
            eq(billPayments.debtPaymentId, debtPaymentAudit.paymentId),
            eq(billPayments.householdId, debtPaymentAudit.householdId),
          ),
        )
        .where(and(eq(billPayments.householdId, householdId), eq(billPayments.billId, billId)))
        .orderBy(asc(debtPaymentAudit.id))
        .all()
    },
    transaction<T>(operation: () => T) {
      return db.transaction(operation, { behavior: 'immediate' })
    },
    list(householdId: string) {
      return db
        .select()
        .from(bills)
        .where(eq(bills.householdId, householdId))
        .orderBy(asc(bills.id))
        .all()
        .map(hydrate)
    },
    find(householdId: string, id: string) {
      const row = db.select().from(bills).where(key(householdId, id)).get()
      return row ? hydrate(row) : undefined
    },
    create(householdId: string, actor: string, input: BillInput) {
      const id = randomUUID(),
        now = new Date().toISOString(),
        { memberIds, ...fields } = input
      db.insert(bills)
        .values({
          ...fields,
          id,
          householdId,
          createdByUserId: actor,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      for (const memberId of memberIds)
        db.insert(billMembers).values({ householdId, billId: id, memberId }).run()
      return this.find(householdId, id)!
    },
    update(householdId: string, id: string, input: BillInput) {
      const { memberIds, ...fields } = input
      db.update(bills).set(fields).where(key(householdId, id)).run()
      db.delete(billMembers)
        .where(and(eq(billMembers.householdId, householdId), eq(billMembers.billId, id)))
        .run()
      for (const memberId of memberIds)
        db.insert(billMembers).values({ householdId, billId: id, memberId }).run()
      this.touch(householdId, id)
    },
    touch(householdId: string, id: string) {
      db.update(bills)
        .set({ revision: sql`${bills.revision} + 1`, updatedAt: new Date().toISOString() })
        .where(key(householdId, id))
        .run()
    },
    periods(householdId: string, billId: string) {
      return db
        .select()
        .from(billPeriods)
        .where(and(eq(billPeriods.householdId, householdId), eq(billPeriods.billId, billId)))
        .orderBy(asc(billPeriods.dueDate), asc(billPeriods.id))
        .all()
    },
    createPeriod(bill: Bill, dueDate: string) {
      const now = new Date().toISOString()
      db.insert(billPeriods)
        .values({
          id: randomUUID(),
          householdId: bill.householdId,
          billId: bill.id,
          dueDate,
          billingPeriod:
            bill.frequency === 'monthly' ||
            bill.frequency === 'quarterly' ||
            bill.frequency === 'annually'
              ? dueDate.slice(0, 7)
              : dueDate,
          name: bill.name,
          category: bill.category,
          categoryId: bill.categoryId,
          amountCents: bill.amountType === 'fixed' ? bill.amountCents : null,
          estimatedAmountCents: bill.estimatedAmountCents,
          linkedDebtId: bill.linkedDebtId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run()
    },
    updatePeriod(
      householdId: string,
      id: string,
      values: {
        amountCents: number | null
        creditCents: number
        notes: string | null
        estimatedAmountCents?: number | null
      },
    ) {
      db.update(billPeriods)
        .set({ ...values, updatedAt: new Date().toISOString() })
        .where(and(eq(billPeriods.householdId, householdId), eq(billPeriods.id, id)))
        .run()
    },
    reschedulePeriod(householdId: string, id: string, dueDate: string) {
      db.update(billPeriods)
        .set({ dueDate, updatedAt: new Date().toISOString() })
        .where(and(eq(billPeriods.householdId, householdId), eq(billPeriods.id, id)))
        .run()
    },
    payments(householdId: string, billId?: string): BillPayment[] {
      return db
        .select()
        .from(billPayments)
        .where(
          and(
            eq(billPayments.householdId, householdId),
            billId ? eq(billPayments.billId, billId) : undefined,
          ),
        )
        .orderBy(asc(billPayments.id))
        .all()
        .map((row) => {
          const linked = row.debtPaymentId
            ? db
                .select()
                .from(debtPayments)
                .where(
                  and(
                    eq(debtPayments.householdId, householdId),
                    eq(debtPayments.id, row.debtPaymentId),
                  ),
                )
                .get()
            : undefined
          return {
            ...row,
            refunds: billPaymentRefunds(db, householdId, row.id, row.debtPaymentId),
            ...(linked
              ? {
                  amountCents: linked.amountCents,
                  paymentDate: linked.paymentDate,
                  method: linked.paymentMethod,
                  notes: linked.notes,
                  status: linked.paymentStatus,
                  principalAmountCents: linked.principalAmountCents,
                  interestAmountCents: linked.interestAmountCents,
                  feesAmountCents: linked.feesAmountCents,
                  referenceNumber: linked.referenceNumber,
                  updatedAt: linked.updatedAt,
                }
              : {}),
          } as BillPayment
        })
    },
    rawPayment(householdId: string, id: string) {
      return db.select().from(billPayments).where(paymentKey(householdId, id)).get()
    },
    findPaymentKey(householdId: string, idempotencyKey: string) {
      return db
        .select()
        .from(billPayments)
        .where(
          and(
            eq(billPayments.householdId, householdId),
            eq(billPayments.idempotencyKey, idempotencyKey),
          ),
        )
        .get()
    },
    linkedPayment(householdId: string, debtPaymentId: string) {
      return db
        .select()
        .from(billPayments)
        .where(
          and(
            eq(billPayments.householdId, householdId),
            eq(billPayments.debtPaymentId, debtPaymentId),
          ),
        )
        .get()
    },
    insertPayment(values: typeof billPayments.$inferInsert) {
      db.insert(billPayments).values(values).run()
    },
    updatePayment(
      householdId: string,
      id: string,
      values: Partial<typeof billPayments.$inferInsert>,
    ) {
      guardBankReference(db, householdId, 'billPaymentId', id)
      db.update(billPayments)
        .set({ ...values, updatedAt: new Date().toISOString() })
        .where(paymentKey(householdId, id))
        .run()
    },
    audit(
      householdId: string,
      billId: string,
      actorUserId: string,
      action: string,
      targetId: string,
      before: unknown,
      after: unknown,
    ) {
      db.insert(billAudit)
        .values({
          id: randomUUID(),
          householdId,
          billId,
          actorUserId,
          action,
          targetId,
          beforeJson: before == null ? null : JSON.stringify(before),
          afterJson: after == null ? null : JSON.stringify(after),
          createdAt: new Date().toISOString(),
        })
        .run()
    },
    auditList(householdId: string, billId: string) {
      return db
        .select()
        .from(billAudit)
        .where(and(eq(billAudit.householdId, householdId), eq(billAudit.billId, billId)))
        .orderBy(asc(billAudit.createdAt))
        .all()
    },
    requests(householdId: string): BillChangeRequest[] {
      return db
        .select({ row: billChangeRequests, name: users.fullName })
        .from(billChangeRequests)
        .innerJoin(users, eq(users.id, billChangeRequests.proposedByUserId))
        .where(eq(billChangeRequests.householdId, householdId))
        .orderBy(asc(billChangeRequests.createdAt))
        .all()
        .map(({ row, name }) => ({
          ...row,
          proposal: JSON.parse(row.proposalJson),
          originalValues: JSON.parse(row.originalJson),
          proposedByName: name,
        })) as BillChangeRequest[]
    },
    request(householdId: string, id: string) {
      return db
        .select()
        .from(billChangeRequests)
        .where(and(eq(billChangeRequests.householdId, householdId), eq(billChangeRequests.id, id)))
        .get()
    },
    requestKey(householdId: string, actor: string, idempotencyKey: string) {
      return db
        .select()
        .from(billChangeRequests)
        .where(
          and(
            eq(billChangeRequests.householdId, householdId),
            eq(billChangeRequests.proposedByUserId, actor),
            eq(billChangeRequests.idempotencyKey, idempotencyKey),
          ),
        )
        .get()
    },
    insertRequest(values: typeof billChangeRequests.$inferInsert) {
      db.insert(billChangeRequests).values(values).run()
    },
    finishRequest(
      householdId: string,
      id: string,
      actor: string,
      status: 'approved' | 'rejected' | 'cancelled',
      reviewNote: string | null,
    ) {
      const result = db
        .update(billChangeRequests)
        .set({
          status,
          reviewNote,
          reviewedByUserId: actor,
          reviewedAt: new Date().toISOString(),
          activeTarget: null,
        })
        .where(
          and(
            eq(billChangeRequests.householdId, householdId),
            eq(billChangeRequests.id, id),
            eq(billChangeRequests.status, 'pending'),
          ),
        )
        .run()
      if (result.changes !== 1) throw new Error('Request changed during review')
    },
  }
}
export type BillRepository = ReturnType<typeof billRepository>
