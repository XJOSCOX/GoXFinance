import { eq } from 'drizzle-orm'
import type { DebtPayment } from '@goxfinance/shared'
import { debtPayments } from '../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../db/connection'
export function overviewRepository(db: DatabaseConnection) {
  return {
    payments(householdId: string) {
      return db
        .select()
        .from(debtPayments)
        .where(eq(debtPayments.householdId, householdId))
        .all() as DebtPayment[]
    },
  }
}
