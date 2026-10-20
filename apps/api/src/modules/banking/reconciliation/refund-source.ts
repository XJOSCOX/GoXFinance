import { and, eq } from 'drizzle-orm'
import {
  bankRefunds,
  bankRefundMembers,
  bankRefundAllocations,
} from '../../../../../../packages/db/src/schema'
import type { FinancialRefund } from '@goxfinance/shared'
import type { DatabaseConnection } from '../../../db/connection'
export function financialRefunds(db: DatabaseConnection, home: string): FinancialRefund[] {
  const members = db
      .select()
      .from(bankRefundMembers)
      .where(eq(bankRefundMembers.householdId, home))
      .all(),
    allocations = db
      .select()
      .from(bankRefundAllocations)
      .where(eq(bankRefundAllocations.householdId, home))
      .all()
  return db
    .select()
    .from(bankRefunds)
    .where(eq(bankRefunds.householdId, home))
    .all()
    .map((r) => ({
      id: r.id,
      expenseId: r.expenseId,
      billPaymentId: r.billPaymentId,
      debtPaymentId: r.debtPaymentId,
      amountCents: r.amountCents,
      date: r.date,
      method: r.method,
      status: r.status as FinancialRefund['status'],
      memberIds: members.filter((m) => m.refundId === r.id).map((m) => m.memberId),
      allocations: allocations
        .filter((a) => a.refundId === r.id)
        .map((a) => ({ categoryId: a.categoryId, amountCents: a.amountCents })),
    }))
}
export function billPaymentRefunds(
  db: DatabaseConnection,
  home: string,
  id: string,
  debtPaymentId: string | null,
) {
  return db
    .select({
      id: bankRefunds.id,
      amountCents: bankRefunds.amountCents,
      date: bankRefunds.date,
      status: bankRefunds.status,
    })
    .from(bankRefunds)
    .where(
      and(
        eq(bankRefunds.householdId, home),
        debtPaymentId
          ? eq(bankRefunds.debtPaymentId, debtPaymentId)
          : eq(bankRefunds.billPaymentId, id),
      ),
    )
    .all()
}
