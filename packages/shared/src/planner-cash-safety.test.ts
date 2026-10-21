import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { smartPlanner } from './planner-engine'
import { plannerFixture, plannerRecord, fictionalBill } from './planner.fixture'
import { plannerInputSchema } from './planner'
import { smartInput, smartSources } from './smart-forecast.fixture'
const today = '2026-10-20'
it('only applies the change from a pending hold captured in opening available cash', () => {
  const s = smartSources(),
    v = smartInput(90000),
    bill = fictionalBill('Utility', 10000, '2026-10-22'),
    pay = {
      id: randomUUID(),
      billId: bill.id,
      periodId: bill.periods[0].id,
      amountCents: 10000,
      paymentDate: '2026-10-22',
      status: 'pending',
      method: 'cash',
      debtPaymentId: null,
    } as never
  s.bills = [{ ...bill, payments: [pay] }]
  const accountId = randomUUID(),
    balanceId = randomUUID()
  v.smart!.opening = {
    ...v.smart!.opening!,
    source: 'selected_accounts',
    accounts: [{ accountId, balanceId, availableCents: 90000 }],
  }
  s.planner = {
    records: [
      plannerRecord(
        plannerInputSchema.parse({
          kind: 'balance',
          name: 'Captured pending debit',
          accountId,
          balanceId,
          effectiveAt: '2026-10-20T13:00:00Z',
          timezone: 'America/Chicago',
          source: 'user_reported',
          verification: { verified: false },
          pendingIncluded: 'yes',
          includedPending: [
            { eventId: 'planned-bill:' + (pay as { id: string }).id, amountCents: 10000 },
          ],
        }),
      ),
    ],
  }
  expect(smartPlanner(s, v, today).forecast.outflowCents).toBe(0)
  ;(pay as { amountCents: number }).amountCents = 12000
  expect(smartPlanner(s, v, today).forecast.outflowCents).toBe(2000)
  ;(pay as { status: string }).status = 'cancelled'
  expect(smartPlanner(s, v, today).warnings.join(' ')).toContain('release timing is unknown')
})
it('new unlinked payments invalidate installment substitution until reconciled rather than double counting installments', () => {
  const { sources: s, input: v, rent } = plannerFixture()
  s.bills[0].payments.push({
    id: randomUUID(),
    periodId: rent.periods[0].id,
    amountCents: 20000,
    status: 'pending',
    paymentDate: '2026-10-21',
    method: 'cash',
    debtPaymentId: null,
  } as never)
  const r = smartPlanner(s, v, today)
  expect(r.warnings.join(' ')).toContain('unlinked payments')
  expect(r.forecast.events.some((e) => e.kind === 'installment')).toBe(false)
  expect(r.forecast.outflowCents).toBe(140500)
})
it('a new authoritative advance repayment replaces its forecast automatically through the dedicated debt link', () => {
  const { sources: s, input: v, advance } = plannerFixture()
  s.payments = [
    {
      id: randomUUID(),
      debtId: advance.id,
      amountCents: 12000,
      paymentDate: '2026-10-23',
      paymentStatus: 'scheduled',
      paymentMethod: 'cash',
    } as never,
  ]
  const r = smartPlanner(s, v, today)
  expect(r.forecast.outflowCents).toBe(140500)
  expect(r.forecast.events.some((e) => e.kind === 'advance_repayment')).toBe(false)
})
it('protects opted-in remaining category limits without treating budget limits as actual cash outflows', () => {
  const s = smartSources(),
    v = smartInput(50000),
    id = randomUUID()
  s.categories = [{ id, name: 'Groceries' } as never]
  s.budgets = [
    {
      id: randomUUID(),
      month: '2026-10',
      status: 'active',
      responsibleMemberId: null,
      totalCents: 20000,
      limits: [{ categoryId: id, amountCents: 20000 }],
    } as never,
  ]
  s.planner = {
    records: [
      plannerRecord(
        plannerInputSchema.parse({
          kind: 'preferences',
          name: 'Budget reserves',
          essentialReserveCents: 0,
          accountIds: [],
          useBudgetReserves: true,
        }),
      ),
    ],
  }
  const r = smartPlanner(s, v, today)
  expect(r.reservedCents).toBe(20000)
  expect(r.confirmedSpendableCents).toBe(30000)
  expect(r.forecast.outflowCents).toBe(0)
})
it('per-paycheck sinking reserves reduce only the chosen conditional funding lot', () => {
  const { sources: s, input: v } = plannerFixture()
  s.planner!.records.push(
    plannerRecord(
      plannerInputSchema.parse({
        kind: 'allocation',
        name: 'Emergency from payday',
        target: null,
        purpose: 'emergency',
        amountCents: 20000,
        date: '2026-10-23',
        fundingEventId: 'payroll:week',
        status: 'accepted',
        priority: 'important',
        explanation: 'Protect emergency money from next paycheck',
      }),
    ),
  )
  const r = smartPlanner(s, v, today)
  expect(r.confirmedSpendableCents).toBe(80000)
  expect(r.reservedCents).toBe(30000)
  expect(r.funding.find((f) => f.id === 'payroll:week')?.remainingCents).toBeGreaterThanOrEqual(0)
  expect(r.forecast.outflowCents).toBe(140500)
})
it('accepted settlement schedules appear in the planner without optional activation or duplicate linked payments', () => {
  const { sources: s, input: v, card } = plannerFixture(),
    id = randomUUID()
  s.offers = [
    {
      id: randomUUID(),
      debtId: card.id,
      status: 'accepted',
      creditor: 'Fictional settlement',
      writtenConfirmed: true,
      schedule: [{ id, dueDate: '2026-10-27', amountCents: 7500, paymentId: null }],
    } as never,
  ]
  const r = smartPlanner(s, v, today)
  expect(r.forecast.events.filter((e) => e.kind === 'settlement')).toHaveLength(1)
  expect(r.forecast.outflowCents).toBe(140500)
})
it('an overdrawn opening with no obligations is not declared a funded solution', () => {
  const r = smartPlanner(smartSources(), smartInput(-10000), today)
  expect(r.fullyFunded).toBe(false)
  expect(r.forecast.shortfalls.length).toBeGreaterThan(0)
})

it('keeps insufficient essential reserves in the total funding gap', () => {
  const s = smartSources()
  s.planner = {
    records: [
      plannerRecord(
        plannerInputSchema.parse({
          kind: 'preferences',
          name: 'Living',
          essentialReserveCents: 20000,
          accountIds: [],
        }),
      ),
    ],
  }
  const r = smartPlanner(s, smartInput(10000), today)
  expect(r.unfundedReservesCents).toBe(10000)
  expect(r.unfundedCents).toBe(10000)
  expect(r.fullyFunded).toBe(false)
})
