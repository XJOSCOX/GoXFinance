import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { fictionalBill, fictionalDebt, plannerRecord } from './planner.fixture'
import { smartSources } from './smart-forecast.fixture'
import {
  billCarryForward,
  billPlanningTotals,
  billRegisterAmounts,
  billNextMonthProjection,
} from './bill-obligation-summary'
import { plannerInputSchema, type PlannerData } from './planner'
it('projects next month plus unpaid carry-forward, respecting partial payments and the year boundary', () => {
  const b = fictionalBill('Fictional power', 34218, '2026-12-20')
  b.kind = 'recurring'
  b.frequency = 'monthly'
  b.amountType = 'variable'
  b.estimatedAmountCents = 30000
  b.periods[0].paidCents = 20000
  b.periods[0].paymentStatus = 'partially_paid'
  const before = JSON.stringify(b)
  expect(billNextMonthProjection(b, '2026-12-21')).toMatchObject({
    month: '2027-01',
    due: { amountCents: 30000, estimated: true },
    carried: { amountCents: 14218 },
    totalCents: 44218,
  })
  expect(JSON.stringify(b)).toBe(before)
})
it('includes each weekly due date next month and never recurs one-time bills', () => {
  const b = fictionalBill('Fictional weekly bill', 10000, '2026-11-04')
  b.kind = 'recurring'
  b.frequency = 'weekly'
  expect(billNextMonthProjection(b, '2026-10-21').due.amountCents).toBe(40000)
  b.kind = 'one_time'
  b.frequency = null
  expect(billNextMonthProjection(b, '2026-10-21').due.amountCents).toBe(10000)
})
it('shows a fixed monthly amount and only the current month actuals, keeping older arrears separate', () => {
  const b = fictionalBill('Fictional fixed rent', 66500, '2026-09-03')
  b.kind = 'recurring'
  b.frequency = 'monthly'
  b.periods.push({
    ...b.periods[0],
    id: randomUUID(),
    dueDate: '2026-10-03',
    paidCents: 20000,
    remainingCents: 46500,
    paymentStatus: 'partially_paid',
  })
  b.periods.push({ ...b.periods[0], id: randomUUID(), dueDate: '2026-11-03' })
  expect(billRegisterAmounts(b, '2026-10-21')).toMatchObject({
    monthlyCents: 66500,
    confirmedCents: 66500,
    paidCents: 20000,
    remainingCents: 46500,
    pastDue: { amountCents: 113000 },
  })
})
it('keeps future estimates out of current actuals and does not call upcoming amounts past due', () => {
  const b = fictionalBill('Fictional variable rent', null, '2026-11-03')
  b.amountType = 'variable'
  b.kind = 'recurring'
  b.frequency = 'monthly'
  b.estimatedAmountCents = 194000
  expect(billRegisterAmounts(b, '2026-10-21')).toMatchObject({
    monthlyCents: 194000,
    currentCount: 0,
    confirmedCents: null,
    paidCents: 0,
    pastDue: { amountCents: 0 },
  })
})
it('carries a missed fixed bill into the next payment without changing either period', () => {
  const b = fictionalBill('Fictional auto payment', 66500, '2026-10-03')
  b.periods.push({ ...b.periods[0], id: randomUUID(), dueDate: '2026-11-03' })
  const before = JSON.stringify(b),
    result = billCarryForward(b, '2026-10-21')
  expect(result.past.amountCents).toBe(66500)
  expect(result.nextPayment.amountCents).toBe(133000)
  expect(result.nextDate).toBe('2026-11-03')
  expect(JSON.stringify(b)).toBe(before)
})
it('keeps the estimate and actual amounts separate and carries only the unpaid portion', () => {
  const b = fictionalBill('Fictional variable power', 34218, '2026-10-01')
  b.amountType = 'variable'
  b.estimatedAmountCents = 30000
  b.periods[0].paidCents = 20000
  b.periods[0].paymentStatus = 'partially_paid'
  b.periods.push({
    ...b.periods[0],
    id: randomUUID(),
    dueDate: '2026-11-01',
    amountCents: null,
    estimatedAmountCents: 30000,
    paidCents: 0,
    paymentStatus: 'unpaid',
  })
  const result = billCarryForward(b, '2026-10-21')
  expect(result.past.amountCents).toBe(14218)
  expect(result.nextPayment.amountCents).toBe(44218)
  expect(result.nextPayment.estimated).toBe(true)
  expect(b.estimatedAmountCents).toBe(30000)
})
it('monthly totals count saved variable bills and linked bills once, excluding unconfirmed debt minimums', () => {
  const s = smartSources(),
    d = fictionalDebt(),
    b = fictionalBill('Fictional variable electricity', null, '2026-10-25'),
    car = fictionalBill('Fictional linked car bill', 66500, '2026-10-27')
  b.amountType = 'variable'
  b.estimatedAmountCents = 30000
  b.kind = 'recurring'
  b.frequency = 'monthly'
  b.periods[0].estimatedAmountCents = 30000
  car.kind = 'recurring'
  car.frequency = 'monthly'
  car.linkedDebtId = d.id
  car.periods[0].linkedDebtId = d.id
  s.bills = [b, car]
  s.debts = [d]
  s.planner = { records: [] }
  s.payroll = []
  s.income.sources = []
  const data = { sources: s, settings: null } as PlannerData,
    r = billPlanningTotals(data, '2026-10-21')
  expect(r.monthlyBillsCents).toBe(96500)
  expect(r.billsAndConfirmedPlansCents).toBe(96500)
  expect(r.estimatedRemainingCents).toBe(30000)
  expect(r.confirmedRemainingCents).toBe(66500)
  expect(r.nextMonthBillsCents).toBe(96500)
  expect(r.nextMonth).toBe('2026-11')
  // Older arrears and future periods remain in their own displays, not this month's total.
  car.periods.push({ ...car.periods[0], id: randomUUID(), dueDate: '2026-09-27' })
  car.periods.push({ ...car.periods[0], id: randomUUID(), dueDate: '2026-11-27' })
  car.periods.push({
    ...car.periods[0],
    id: randomUUID(),
    dueDate: '2026-10-01',
    paidCents: 66500,
    remainingCents: 0,
    paymentStatus: 'paid',
  })
  const current = billPlanningTotals(data, '2026-10-21')
  expect(current.confirmedRemainingCents).toBe(66500)
  expect(current.estimatedRemainingCents).toBe(30000)
  const collection = fictionalDebt('Fictional collection')
  s.debts.push(collection)
  s.planner.records.push(
    plannerRecord(
      plannerInputSchema.parse({
        kind: 'debt_plan',
        name: 'Fictional confirmed goal',
        target: { kind: 'debt', id: collection.id },
        mode: 'pay_by_date',
        amountCents: 25000,
        startDate: '2026-10-21',
        deadline: '2026-10-27',
        amountBasis: 'custom',
        verification: { verified: false },
        status: 'confirmed',
      }),
    ),
  )
  expect(billPlanningTotals(data, '2026-10-21').billsAndConfirmedPlansCents).toBe(121500)
})
