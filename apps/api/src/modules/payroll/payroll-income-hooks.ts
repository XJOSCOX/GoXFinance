import {
  incomeTransactionSchema,
  type IncomeTransactionInput,
  type IncomeTransaction,
  type PublicUser,
} from '@goxfinance/shared'
import type { PayrollRepository } from './payroll.repository'
import { FinancialError } from '../households/financial-access'
export function payrollIncomeHooks(store: PayrollRepository) {
  return {
    validate(home: string, id: string, values: IncomeTransactionInput) {
      const w = store.weeks(home).find((w) => w.incomeTransactionId === id)
      if (!w) return
      const old = store.db.query.incomeTransactions
        .findFirst({ where: (t, { and, eq }) => and(eq(t.id, id), eq(t.householdId, home)) })
        .sync()
      if (!old) throw new FinancialError('Linked payroll deposit not found', 409)
      const previous = incomeTransactionSchema.parse(
        Object.fromEntries(
          Object.keys(incomeTransactionSchema.shape).map((k) => [k, old[k as keyof typeof old]]),
        ),
      )
      const mutable = new Set([
        'status',
        'depositDate',
        'receiptConfirmed',
        'notes',
        'reference',
        'actualNetCents',
      ])
      if (
        values.status !== 'confirmed' ||
        Object.entries(values).some(
          ([k, v]) => !mutable.has(k) && v !== previous[k as keyof typeof previous],
        )
      )
        throw new FinancialError(
          'Correct documented payroll through its Payroll review. Only separate deposit confirmation is allowed here.',
          409,
        )
    },
    after(user: PublicUser, home: string, row: IncomeTransaction) {
      const w = store.weeks(home).find((w) => w.incomeTransactionId === row.id)
      if (!w || row.status !== 'confirmed') return
      const now = new Date().toISOString()
      store.patch(home, w.id, {
        stage: 'deposit_confirmed',
        revision: w.revision + 1,
        updatedAt: now,
      })
      store.audit(home, w.sourceId, w.id, user.id, 'deposit_confirmed', null, {
        incomeTransactionId: row.id,
        depositDate: row.depositDate,
        confirmedAt: row.confirmedAt,
      })
    },
  }
}
