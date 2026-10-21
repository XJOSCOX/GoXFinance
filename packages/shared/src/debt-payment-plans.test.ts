import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { smartSources, smartInput } from './smart-forecast.fixture'
import { fictionalDebt, fictionalBill, plannerRecord, proof } from './planner.fixture'
import { plannerInputSchema } from './planner'
import { smartPlanner } from './planner-engine'
import { debtPlanProgress, type DebtPaymentPlan } from './debt-payment-plans'
import { settlementSchema } from './debt-planning'
import type { DebtPayment } from './debt-payments'
const today = '2026-10-21'
function fixture() {
  const s = smartSources(),
    input = smartInput(90000),
    d = fictionalDebt('Fictional collection', 7500, '2026-11-10')
  input.startDate = today
  input.endDate = '2026-11-20'
  s.bills = []
  s.income.sources = []
  s.income.transactions = []
  s.payroll = []
  s.debts = [d]
  s.payments = []
  s.planner = { records: [] }
  return { s, input, d }
}
function plan(id: string, patch: object = {}): DebtPaymentPlan {
  return plannerInputSchema.parse({
    kind: 'debt_plan',
    name: 'Fictional pay collections by Nov 15',
    target: { kind: 'debt', id },
    mode: 'pay_by_date',
    amountCents: 50000,
    startDate: today,
    deadline: '2026-11-15',
    billId: null,
    amountBasis: 'custom',
    replaceOriginal: false,
    verification: { verified: false },
    status: 'confirmed',
    ...patch,
  }) as DebtPaymentPlan
}
const out = (r: ReturnType<typeof smartPlanner>) =>
  r.forecast.events
    .filter((e) => e.estimated && e.direction === 'out')
    .reduce((n, e) => n + (e.amountCents ?? 0), 0)
it('does not schedule unconfirmed imported debt balances, minimums or arrears; keeps linked bills', () => {
  const { s, input, d } = fixture()
  d.pastDueAmountCents = 50000
  expect(out(smartPlanner(s, input, today))).toBe(0)
  const b = fictionalBill('Fictional monthly repayment', 66500, '2026-11-01')
  b.linkedDebtId = d.id
  b.periods[0].linkedDebtId = d.id
  s.bills = [b]
  expect(out(smartPlanner(s, input, today))).toBe(66500)
  expect(smartPlanner(s, input, today).warnings.join(' ')).toContain(
    'need payment-plan confirmation',
  )
})
it('draft goals have no cash effect; confirmed deadlines add only the residual beyond scheduled minimums', () => {
  const { s, input, d } = fixture()
  s.planner!.records = [plannerRecord(plan(d.id, { status: 'draft' }))]
  expect(out(smartPlanner(s, input, today))).toBe(0)
  s.planner!.records = [plannerRecord(plan(d.id))]
  expect(out(smartPlanner(s, input, today))).toBe(50000)
  expect(smartPlanner(s, input, today).items.some((i) => i.date === '2026-11-15')).toBe(true)
  expect(d.currentBalanceCents).toBe(50000)
})
it('uses a verified accepted settlement amount once while retaining the original reported balance', () => {
  const { s, input, d } = fixture()
  d.currentBalanceCents = 1463500
  d.pastDueAmountCents = 1463500
  const offer = {
    ...settlementSchema.parse({
      debtId: d.id,
      creditor: 'Fictional creditor',
      originalBalanceCents: 1463500,
      amountCents: 800000,
      offerDate: today,
      expirationDate: null,
      kind: 'lump_sum',
      status: 'accepted',
      writtenConfirmed: true,
      notes: null,
      document: null,
      schedule: [{ id: randomUUID(), dueDate: '2026-11-15', amountCents: 800000, paymentId: null }],
    }),
    id: randomUUID(),
    revision: 1,
    createdAt: today,
    updatedAt: today,
    canManage: true,
  }
  s.offers = [offer]
  s.planner!.records = [
    plannerRecord(
      plan(d.id, {
        amountCents: 800000,
        amountBasis: 'settlement',
        settlementId: offer.id,
        settlementRevision: 1,
        replaceOriginal: true,
        verification: proof,
      }),
    ),
  ]
  expect(out(smartPlanner(s, input, today))).toBe(800000)
  expect(d.currentBalanceCents).toBe(1463500)
  offer.revision = 2
  expect(smartPlanner(s, input, today).warnings.join(' ')).toContain('settlement offer changed')
})
it('deducts completed payments once and leaves pending payments out of paid goal progress', () => {
  const { s, input, d } = fixture(),
    p = plan(d.id)
  s.payments = [
    {
      id: randomUUID(),
      debtId: d.id,
      paymentDate: today,
      paymentStatus: 'completed',
      amountCents: 20000,
      paymentMethod: 'bank_transfer',
    },
    {
      id: randomUUID(),
      debtId: d.id,
      paymentDate: '2026-11-05',
      paymentStatus: 'pending',
      amountCents: 10000,
      paymentMethod: 'bank_transfer',
    },
  ] as DebtPayment[]
  s.planner!.records = [plannerRecord(p)]
  expect(debtPlanProgress(p, s, today)).toEqual({ paidCents: 20000, remainingCents: 30000 })
  expect(out(smartPlanner(s, input, today))).toBe(30000)
  s.payments[0].paymentStatus = 'cancelled'
  expect(debtPlanProgress(p, s, today).remainingCents).toBe(50000)
})
it('uses provider-confirmed linked monthly bills rather than charged-off arrears and invalidates changed terms', () => {
  const { s, input, d } = fixture()
  d.pastDueAmountCents = 2780800
  const b = fictionalBill('Fictional monthly auto arrangement', 66500, '2026-11-01')
  b.linkedDebtId = d.id
  b.periods[0].linkedDebtId = d.id
  b.updatedAt = '2026-10-21T12:00:00Z'
  s.bills = [b]
  s.planner!.records = [
    plannerRecord(
      plan(d.id, {
        mode: 'linked_bill',
        billId: b.id,
        billUpdatedAt: b.updatedAt,
        amountCents: null,
        replaceOriginal: true,
        verification: proof,
      }),
    ),
  ]
  expect(out(smartPlanner(s, input, today))).toBe(66500)
  b.updatedAt = '2026-10-22T12:00:00Z'
  expect(smartPlanner(s, input, today).warnings.join(' ')).toContain('linked bill changed')
})
it('requires confirmed amounts and evidence for replacement schedules', () => {
  expect(() => plan(randomUUID(), { amountCents: null })).toThrow('positive')
  expect(() => plan(randomUUID(), { replaceOriginal: true })).toThrow('verified provider')
})
