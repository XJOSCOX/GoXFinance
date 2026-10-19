import { describe, expect, it } from 'vitest'
import {
  billAverage,
  billMonthlyCents,
  billPeriodView,
  billScheduleDates,
  calculateBillSummary,
  billBudgetEstimate,
} from './bill-calculations'
import { billInputSchema, type BillPayment, type BillPeriod, type BillView } from './bills'
import { randomUUID } from 'node:crypto'
import { createDebtSchema, type Debt } from './debts'

const period: BillPeriod = {
  id: randomUUID(),
  householdId: randomUUID(),
  billId: randomUUID(),
  billingPeriod: '2026-09',
  dueDate: '2026-09-10',
  name: 'Utility',
  category: 'Utilities',
  amountCents: null,
  estimatedAmountCents: 30000,
  creditCents: 0,
  notes: null,
  linkedDebtId: null,
  createdAt: '',
  updatedAt: '',
}
const payment = (amountCents: number, status: BillPayment['status'] = 'completed') =>
  ({
    id: randomUUID(),
    periodId: period.id,
    paymentDate: '2026-09-10',
    amountCents,
    status,
  }) as BillPayment
describe('billing schedules and actual amounts', () => {
  it.each([
    ['weekly', 5200],
    ['biweekly', 2600],
    ['monthly', 1200],
    ['quarterly', 400],
    ['annually', 100],
  ] as const)('normalizes %s to a monthly equivalent', (frequency, result) =>
    expect(billMonthlyCents(1200, frequency)).toBe(result),
  )
  it('preserves unknown amounts', () => expect(billMonthlyCents(null, 'monthly')).toBeNull())
  it('keeps the monthly anchor through short months and leap years', () => {
    expect(
      billScheduleDates(
        { kind: 'recurring', frequency: 'monthly', nextDueDate: '2024-01-31', endDate: null },
        '2024-03-01',
      ),
    ).toEqual(['2024-01-31', '2024-02-29', '2024-03-31'])
  })
  it('never repeats a one-time bill and respects end dates', () => {
    expect(
      billScheduleDates(
        { kind: 'one_time', frequency: null, nextDueDate: '2026-01-10', endDate: null },
        '2027-01-01',
      ),
    ).toEqual(['2026-01-10'])
    expect(
      billScheduleDates(
        {
          kind: 'recurring',
          frequency: 'biweekly',
          nextDueDate: '2026-01-01',
          endDate: '2026-01-29',
        },
        '2027-01-01',
      ),
    ).toEqual(['2026-01-01', '2026-01-15', '2026-01-29'])
  })
  it('does not convert estimates or pending payments into actual amounts', () => {
    const result = billPeriodView(period, [payment(30000, 'pending')], false, '2026-10-01')
    expect(result).toMatchObject({
      remainingCents: null,
      paidCents: 0,
      paymentStatus: 'unpaid',
      amountIsEstimate: true,
      overdue: true,
    })
  })
  it('calculates partial, completed, cancelled and overpaid amounts explicitly', () => {
    const actual = { ...period, amountCents: 34218 }
    expect(
      billPeriodView(actual, [payment(20000), payment(500, 'cancelled')], false, '2026-10-01'),
    ).toMatchObject({ remainingCents: 14218, paymentStatus: 'partially_paid' })
    expect(billPeriodView(actual, [payment(34218)], false, '2026-10-01').paymentStatus).toBe('paid')
    expect(billPeriodView(actual, [payment(35000)], false, '2026-10-01')).toMatchObject({
      overpaidCents: 782,
      paymentStatus: 'overpaid',
    })
    expect(
      billPeriodView({ ...actual, creditCents: 14218 }, [payment(20000)], false, '2026-10-01')
        .paymentStatus,
    ).toBe('credited')
    expect(billPeriodView(actual, [], true, '2026-10-01').overdue).toBe(false)
  })
  it('averages actual completed periods with a sample count', () => {
    const periods = [20000, 30000, 40000, 60000].map((amount, index) =>
      billPeriodView(
        { ...period, dueDate: `2026-0${index + 1}-10`, amountCents: amount },
        [payment(amount)],
        false,
        '2026-10-01',
      ),
    )
    const unknown = billPeriodView(period, [payment(30000)], false, '2026-10-01')
    expect(billAverage([...periods, unknown], 3)).toEqual({ averageCents: 43333, sampleCount: 3 })
    expect(billAverage(periods, 6)).toEqual({ averageCents: 37500, sampleCount: 4 })
    expect(billAverage([], 12)).toEqual({ averageCents: null, sampleCount: 0 })
  })
  it('replaces debt minimums with linked obligations instead of adding them', () => {
    const debt: Debt = {
      ...createDebtSchema.parse({
        creditorName: 'Example',
        accountType: 'auto_loan',
        minimumPaymentCents: 10000,
        memberAssignments: [{ memberId: randomUUID(), responsibility: 'primary' }],
      }),
      id: randomUUID(),
      householdId: period.householdId,
      createdByUserId: randomUUID(),
      createdAt: '',
      updatedAt: '',
      isArchived: false,
    }
    const input = billInputSchema.parse({
      name: 'Loan',
      category: 'Transport',
      kind: 'recurring',
      amountType: 'fixed',
      amountCents: 20000,
      estimatedAmountCents: null,
      frequency: 'monthly',
      nextDueDate: '2026-10-01',
      endDate: null,
      autoPay: false,
      status: 'active',
      notes: null,
      linkedDebtId: debt.id,
      memberIds: [randomUUID()],
    })
    const bill = {
      ...input,
      id: randomUUID(),
      householdId: debt.householdId,
      createdByUserId: debt.createdByUserId,
      revision: 1,
      createdAt: '',
      updatedAt: '',
      periods: [],
      payments: [],
      canManage: true,
      requiresApproval: false,
    } as BillView
    expect(calculateBillSummary([bill], [debt], '2026-10-01')).toMatchObject({
      standaloneMonthlyCents: 0,
      householdMonthlyObligationsCents: 20000,
    })
  })
})
it('does not reduce bills with future completed payments', () => {
  const result = billPeriodView(
    { ...period, amountCents: 10000 },
    [{ ...payment(10000), paymentDate: '2099-01-01' }],
    false,
    '2026-10-19',
  )
  expect(result.paidCents).toBe(0)
  expect(result.remainingCents).toBe(10000)
})
it('calculates completed-period averages without losing cents at large valid values', () => {
  const periods = [Number.MAX_SAFE_INTEGER, 0, 0].map((amount) =>
    billPeriodView(
      { ...period, amountCents: amount },
      amount ? [payment(amount)] : [],
      false,
      '2026-10-01',
    ),
  )
  expect(billAverage(periods, 3).averageCents).toBe(3002399751580330)
})

it('reports unconfirmed bill totals separately from the known remaining total', () => {
  const bill = {
    status: 'active',
    kind: 'one_time',
    periods: [
      billPeriodView({ ...period, amountCents: null }, [], false, '2026-10-19'),
      billPeriodView({ ...period, amountCents: 34218 }, [payment(20000)], false, '2026-10-19'),
    ],
  } as BillView
  expect(calculateBillSummary([bill], [], '2026-10-19')).toMatchObject({
    outstandingCents: 14218,
    unknownPeriodCount: 1,
    confirmedPeriodCount: 1,
  })
})

it('uses the saved estimate only for open current/future periods with missing snapshots', () => {
  const bill = { amountType: 'variable', status: 'active', estimatedAmountCents: 30000 } as BillView
  const open = billPeriodView(
    {
      ...period,
      estimatedAmountCents: null,
      amountCents: null,
      dueDate: '2026-10-21',
      creditCents: 0,
    },
    [],
    false,
    '2026-10-19',
  )
  expect(billBudgetEstimate(bill, open, '2026-10-19')).toBe(30000)
  expect(open.estimatedAmountCents).toBeNull()
  expect(open.amountCents).toBeNull()
  expect(open.remainingCents).toBeNull()
  expect(open.paidCents).toBe(0)
  for (const changes of [
    { dueDate: '2026-09-21' },
    { amountCents: 34218 },
    { paidCents: 20000 },
    { creditCents: 100 },
  ])
    expect(billBudgetEstimate(bill, { ...open, ...changes }, '2026-10-19')).toBeNull()
  expect(billBudgetEstimate(bill, { ...open, estimatedAmountCents: 25000 }, '2026-10-19')).toBe(
    25000,
  )
  expect(billBudgetEstimate(bill, { ...open, estimatedAmountCents: 0 }, '2026-10-19')).toBe(0)
  expect(billBudgetEstimate({ ...bill, estimatedAmountCents: null }, open, '2026-10-19')).toBeNull()
})
