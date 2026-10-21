import { randomUUID } from 'node:crypto'
import { plannerInputSchema, type PlannerRecord, type PlannerInput } from './planner'
import type { BillView } from './bills'
import type { Debt } from './debts'
import { smartSources, smartInput, smartSource, smartWeek } from './smart-forecast.fixture'
export const proof = {
  verified: true,
  source: 'Fictional accepted written agreement',
  verifiedAt: '2026-10-19T12:00:00Z',
  validThrough: null,
}
export const plannerRecord = (values: PlannerInput): PlannerRecord => ({
  id: randomUUID(),
  householdId: randomUUID(),
  createdByUserId: randomUUID(),
  revision: 1,
  createdAt: '2026-10-19T12:00:00Z',
  updatedAt: '2026-10-19T12:00:00Z',
  values,
})
export const fictionalBill = (name: string, amountCents: number | null, date: string): BillView =>
  ({
    id: randomUUID(),
    name,
    status: 'active',
    memberIds: [],
    kind: 'one_time',
    amountType: 'fixed',
    amountCents,
    estimatedAmountCents: null,
    nextDueDate: date,
    frequency: null,
    endDate: null,
    linkedDebtId: null,
    payments: [],
    periods: [
      {
        id: randomUUID(),
        name,
        dueDate: date,
        amountCents,
        creditCents: 0,
        paidCents: 0,
        remainingCents: amountCents,
        budgetEstimateCents: null,
        estimatedAmountCents: null,
        linkedDebtId: null,
        paymentStatus: 'unpaid',
      },
    ],
  }) as unknown as BillView
export const fictionalDebt = (name = 'Fictional card', minimum = 7500, date = '2026-10-27'): Debt =>
  ({
    id: randomUUID(),
    householdId: randomUUID(),
    isArchived: false,
    creditorName: name,
    accountNickname: null,
    accountType: 'credit_card',
    currentBalanceCents: 50000,
    minimumPaymentCents: minimum,
    pastDueAmountCents: null,
    dueDay: Number(date.slice(-2)),
    nextDueDate: date,
    memberAssignments: [],
    confidence: 'unverified',
    interestRateApr: null,
  }) as unknown as Debt
export const fictionalAdvance = (id: string) =>
  plannerInputSchema.parse({
    kind: 'advance',
    name: 'Fictional advance',
    target: { kind: 'debt', id },
    provider: 'Fictional provider',
    advanceType: 'loan',
    principalCents: 10000,
    receivedCents: 10000,
    receivedDate: '2026-10-19',
    received: true,
    feesCents: 2000,
    tipsCents: 0,
    expeditedCents: 0,
    feeCollection: 'repayment',
    repaymentCents: 12000,
    repaymentDate: '2026-10-23',
    repaymentMethod: 'bank_debit',
    autoDebit: true,
    sourceId: null,
    payrollWeekId: null,
    deductionTreatment: 'included',
    verification: proof,
    status: 'active',
    accountId: null,
  }) as Extract<PlannerInput, { kind: 'advance' }>
export function plannerFixture() {
  const sources = smartSources(),
    input = smartInput(90000)
  input.endDate = '2026-10-29'
  sources.planner = { records: [] }
  sources.income.sources = [smartSource()]
  sources.payroll = [smartWeek()]
  const rent = fictionalBill('Fictional rent', 100000, '2026-10-21'),
    utility = fictionalBill('Fictional electricity', 13000, '2026-10-22'),
    phone = fictionalBill('Fictional phone', 8000, '2026-10-23'),
    card = fictionalDebt(),
    advance = fictionalDebt('Fictional advance', 12000, '2026-10-23')
  sources.bills = [rent, utility, phone]
  sources.debts = [card, advance]
  sources.planner.records = [
    plannerRecord(
      plannerInputSchema.parse({
        kind: 'arrangement',
        name: 'Fictional split rent',
        arrangementType: 'split',
        target: { kind: 'bill_period', id: rent.periods[0].id, parentId: rent.id },
        provider: 'Fictional landlord',
        originalCents: 100000,
        financedCents: 100000,
        status: 'accepted',
        verification: proof,
        replacesOriginal: true,
        coverageStart: '2026-10-21',
        coverageEnd: '2026-10-28',
        installments: [
          { id: randomUUID(), date: '2026-10-21', principalCents: 55000 },
          { id: randomUUID(), date: '2026-10-28', principalCents: 45000 },
        ],
      }),
    ),
    plannerRecord(fictionalAdvance(advance.id)),
    plannerRecord(
      plannerInputSchema.parse({
        kind: 'preferences',
        name: 'Fictional groceries reserve',
        essentialReserveCents: 10000,
        accountIds: [],
      }),
    ),
  ]
  return { sources, input, rent, utility, phone, card, advance }
}
