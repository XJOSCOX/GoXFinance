import { eq } from 'drizzle-orm'
import { financialRefunds } from '../banking/reconciliation/refund-source'
import { billPaymentRefunds } from '../banking/reconciliation/refund-source'
import type { DebtBalanceHistory, DebtPayment } from '@goxfinance/shared'
import { debtBalanceHistory, debtPayments } from '../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../db/connection'
export function overviewRepository(db: DatabaseConnection) {
  return {
    refunds: (home: string) => financialRefunds(db, home),
    balances(householdId: string) {
      return db
        .select()
        .from(debtBalanceHistory)
        .where(eq(debtBalanceHistory.householdId, householdId))
        .all() as DebtBalanceHistory[]
    },
    payments(householdId: string) {
      return db
        .select()
        .from(debtPayments)
        .where(eq(debtPayments.householdId, householdId))
        .all()
        .map((p) => ({
          ...p,
          refunds: billPaymentRefunds(db, householdId, p.id, p.id),
        })) as DebtPayment[]
    },
  }
}
