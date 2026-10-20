import { and, eq } from 'drizzle-orm'
import {
  bankRefunds,
  bankReconciliations,
  bankTransactions,
} from '../../../../packages/db/src/schema'
import type { DatabaseConnection } from './connection'
import { FinancialError } from '../modules/households/financial-access'
/** Called inside the existing record's transaction. Portable ORM queries keep reconciliation from silently diverging. */
export function guardBankReference(
  db: DatabaseConnection,
  home: string,
  kind: 'expenseId' | 'incomeId' | 'billPaymentId' | 'debtPaymentId',
  id: string,
) {
  if (
    kind !== 'incomeId' &&
    db
      .select({ id: bankRefunds.id })
      .from(bankRefunds)
      .where(
        and(
          eq(bankRefunds.householdId, home),
          eq(bankRefunds[kind], id),
          eq(bankRefunds.status, 'completed'),
        ),
      )
      .get()
  )
    throw new FinancialError(
      'This record has an active refund adjustment. Correct or cancel that adjustment before changing the original record.',
      409,
    )
  for (const link of db
    .select()
    .from(bankReconciliations)
    .where(and(eq(bankReconciliations.householdId, home), eq(bankReconciliations[kind], id)))
    .all()) {
    const tx = db
      .select()
      .from(bankTransactions)
      .where(
        and(eq(bankTransactions.householdId, home), eq(bankTransactions.id, link.transactionId)),
      )
      .get()
    if (tx)
      db.update(bankTransactions)
        .set({
          reviewStatus: 'needs_review',
          revision: tx.revision + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(bankTransactions.id, tx.id))
        .run()
  }
}
