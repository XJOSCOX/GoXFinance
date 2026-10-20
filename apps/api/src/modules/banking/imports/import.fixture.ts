import { randomUUID } from 'node:crypto'
import type { ManualImportInput } from '@goxfinance/shared'
export function statementInput(
  accountId = randomUUID(),
  text = 'date,description,amount\n2026-10-01,Fictional groceries,-42.18\n2026-10-02,Fictional payroll,125.50',
): ManualImportInput {
  return {
    accountId,
    format: 'csv',
    text,
    dateFormat: 'iso',
    sign: 'inflow_positive',
    mapping: {
      date: 'date',
      description: 'description',
      amount: 'amount',
      debit: '',
      credit: '',
      merchant: '',
      currency: '',
      pending: '',
      reference: '',
    },
  }
}
