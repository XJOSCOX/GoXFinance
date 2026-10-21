import { randomUUID } from 'node:crypto'
import type {
  Expense,
  InsightSources,
  FinancialCategory,
  Budget,
  DebtBalanceHistory,
} from './index'
import { smartSources, smartInput } from './smart-forecast.fixture'
export const insightFixture = (): InsightSources => ({
  ...smartSources(),
  balances: [],
  planner: { records: [], goals: [] },
})
export const insightInput = () => smartInput(100000)
export const insightCategory = (name = 'Dining'): FinancialCategory =>
  ({
    id: randomUUID(),
    name,
    householdId: 'home',
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }) as FinancialCategory
export const insightExpense = (
  categoryId: string,
  date: string,
  amountCents: number,
  merchant = 'Fictional shop',
): Expense => ({
  id: randomUUID(),
  householdId: 'home',
  createdByUserId: 'actor',
  responsibleMemberId: 'person',
  description: merchant,
  merchant,
  amountCents,
  transactionDate: date,
  paymentMethod: 'debit_card',
  linkedDebtId: null,
  notes: null,
  allocations: [{ categoryId, amountCents }],
  voided: false,
  revision: 1,
  createdAt: date + 'T12:00:00Z',
  updatedAt: date + 'T12:00:00Z',
  canManage: true,
})
export const insightBudget = (categoryId: string, amountCents: number): Budget =>
  ({
    id: randomUUID(),
    month: '2026-10',
    responsibleMemberId: null,
    totalCents: amountCents,
    limits: [{ categoryId, amountCents }],
    status: 'active',
  }) as Budget
export const insightBalance = (
  debtId: string,
  date: string,
  amount: number,
): DebtBalanceHistory => ({
  id: randomUUID(),
  householdId: 'home',
  debtId,
  balanceCents: amount,
  effectiveDate: date,
  source: 'creditor_statement',
  recordedByUserId: 'actor',
  notes: null,
  createdAt: date + 'T12:00:00Z',
})
