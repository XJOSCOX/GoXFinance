import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { smartPlanner } from './planner-engine'
import { forecast } from './forecast-calculations'
import { plannerInputSchema } from './planner'
import {
  plannerFixture,
  plannerRecord,
  fictionalBill,
  fictionalAdvance,
  fictionalDebt,
  proof,
} from './planner.fixture'
import {
  smartIncome,
  smartInput,
  smartSources,
  smartWeek,
  smartSource,
} from './smart-forecast.fixture'
import { plannerPatterns } from './planner-patterns'
const today = '2026-10-20'
it('allocates the practical example using confirmed cash and conditional payroll without duplicate rent or advance liability', () => {
  const { sources: s, input: v } = plannerFixture(),
    before = JSON.stringify(s),
    r = smartPlanner(s, v, today)
  expect(r.forecast.outflowCents).toBe(140500)
  expect(r.forecast.incomeCents).toBe(80000)
  expect(r.forecast.borrowedCents).toBe(0)
  expect(r.forecast.endingCents).toBe(29500)
  expect(r.reservedCents).toBe(10000)
  expect(r.unfundedCents).toBe(0)
  expect(
    r.items.find((i) => i.name.includes('rent') && i.date === '2026-10-21')?.funding[0].status,
  ).toBe('confirmed_cash')
  expect(
    r.items.find((i) => i.name.includes('rent') && i.date === '2026-10-28')?.funding[0].status,
  ).toBe('forecast_paycheck')
  expect(r.forecast.events.filter((e) => e.kind === 'installment')).toHaveLength(2)
  expect(JSON.stringify(s)).toBe(before)
})
it('a two-day payroll delay creates a deadline funding gap while preserving every obligation and no fake deposits', () => {
  const { sources: s, input: v } = plannerFixture()
  v.smart!.incomeAdjustments = [
    { eventId: 'payroll:week', delayDays: 2, reductionBps: 0, excluded: false },
  ]
  const r = smartPlanner(s, v, today)
  expect(r.unfundedCents).toBe(8000)
  expect(r.items.find((i) => i.name.includes('advance repayment'))?.unfundedCents).toBeGreaterThan(
    0,
  )
  expect(r.funding.find((f) => f.status === 'forecast_paycheck')?.date).toBe('2026-10-25')
  expect(r.insights[0].title).toContain('No fully funded')
  expect(s.income.transactions).toEqual([])
})
it.each(['proposed', 'cancelled', 'defaulted'] as const)(
  '%s arrangements never replace the original rent',
  (status) => {
    const { sources: s, input: v } = plannerFixture()
    const plan = s.planner!.records[0].values
    if (plan.kind === 'arrangement') plan.status = status
    const r = smartPlanner(s, v, today)
    expect(r.forecast.events.filter((e) => e.kind === 'installment')).toHaveLength(0)
    expect(r.forecast.events.find((e) => e.name === 'Fictional rent')?.amountCents).toBe(100000)
  },
)
it('expired arrangement evidence restores original terms and partial payment is not assumed sufficient', () => {
  const { sources: s, input: v } = plannerFixture(),
    plan = s.planner!.records[0].values
  if (plan.kind !== 'arrangement') throw Error()
  plan.verification.validThrough = '2026-10-19'
  const r = smartPlanner(s, v, today)
  expect(r.forecast.events.some((e) => e.kind === 'installment')).toBe(false)
  expect(r.items.find((i) => i.name === 'Fictional rent')?.partialAllowed).toBe(false)
})
it('completed, pending, scheduled and cancelled installment links preserve only one cash deduction', () => {
  const { sources: s, input: v, rent } = plannerFixture(),
    plan = s.planner!.records[0].values
  if (plan.kind !== 'arrangement') throw Error()
  const payment = {
    id: randomUUID(),
    periodId: rent.periods[0].id,
    billId: rent.id,
    amountCents: 20000,
    status: 'pending',
    paymentDate: '2026-10-21',
    method: 'cash',
    debtPaymentId: null,
  } as never
  s.bills[0].payments = [payment]
  plan.installments[0].payments = [{ kind: 'bill', id: (payment as { id: string }).id }]
  expect(smartPlanner(s, v, today).forecast.outflowCents).toBe(140500)
  ;(payment as { status: string }).status = 'cancelled'
  expect(smartPlanner(s, v, today).forecast.outflowCents).toBe(140500)
})
it('loan disbursement is borrowed cash, not payroll, with fees and tips disclosed once', () => {
  const s = smartSources(),
    d = fictionalDebt(),
    p = fictionalAdvance(d.id),
    v = smartInput(0)
  s.debts = [d]
  p.receivedDate = '2026-10-21'
  p.feesCents = 1000
  p.tipsCents = 500
  p.expeditedCents = 500
  p.repaymentCents = 12000
  s.planner = { records: [plannerRecord(p)] }
  const r = smartPlanner(s, v, today)
  expect(r.forecast.borrowedCents).toBe(10000)
  expect(r.forecast.incomeCents).toBe(0)
  expect(r.forecast.netChangeCents).toBe(-2000)
  expect(r.feesCents).toBe(2000)
  expect(r.forecast.events.filter((e) => e.direction === 'out')).toHaveLength(1)
})
it.each(['included', 'subtract_forecast', 'unknown'] as const)(
  'handles %s payroll deduction without a second bank repayment',
  (treatment) => {
    const { sources: s, input: v, advance } = plannerFixture()
    const a = s.planner!.records.find((r) => r.values.kind === 'advance')!.values
    if (a.kind !== 'advance') throw Error()
    Object.assign(a, {
      advanceType: 'earned_wage',
      repaymentMethod: 'payroll_deduction',
      sourceId: 'source',
      payrollWeekId: 'week',
      deductionTreatment: treatment,
    })
    const r = smartPlanner(s, v, today)
    expect(r.forecast.events.some((e) => e.name.includes('advance repayment'))).toBe(false)
    expect(r.forecast.events.find((e) => e.id === 'payroll:week')?.amountCents).toBe(
      treatment === 'unknown' ? null : treatment === 'included' ? 80000 : 68000,
    )
    expect(r.forecast.events.filter((e) => e.reference?.id === advance.id)).toHaveLength(0)
  },
)
it('reviewed and confirmed payroll replaces the pre-deduction forecast and never subtracts deduction twice', () => {
  const { sources: s, input: v } = plannerFixture()
  const a = s.planner!.records.find((r) => r.values.kind === 'advance')!.values
  if (a.kind !== 'advance') throw Error()
  Object.assign(a, {
    advanceType: 'employer',
    repaymentMethod: 'payroll_deduction',
    sourceId: 'source',
    payrollWeekId: 'week',
    deductionTreatment: 'subtract_forecast',
  })
  s.payroll![0].statement = { netCents: 68000, grossCents: 100000, payDate: '2026-10-23' } as never
  s.payroll![0].reviewedAt = '2026-10-20T12:00:00Z'
  expect(smartPlanner(s, v, today).forecast.incomeCents).toBe(68000)
  s.income.transactions = [
    smartIncome({ status: 'confirmed', actualNetCents: 68000, depositDate: '2026-10-23' }),
  ]
  s.payroll![0].incomeTransactionId = 'income'
  expect(smartPlanner(s, v, '2026-10-23').forecast.incomeCents).toBe(68000)
})
it('BNPL recognizes the purchase once as spending and installments once as cash', () => {
  const s = smartSources(),
    v = smartInput(),
    d = fictionalDebt()
  s.debts = [d]
  const expense = {
    id: randomUUID(),
    description: 'Fictional purchase',
    amountCents: 10000,
    transactionDate: '2026-10-21',
    paymentMethod: 'credit_card',
    linkedDebtId: d.id,
    voided: false,
    allocations: [],
  } as never
  s.expenses = [expense]
  s.planner = {
    records: [
      plannerRecord(
        plannerInputSchema.parse({
          kind: 'arrangement',
          name: 'Fictional BNPL',
          target: { kind: 'debt', id: d.id },
          arrangementType: 'bnpl',
          provider: 'Fictional provider',
          originalCents: 10000,
          financedCents: 10000,
          expenseId: (expense as { id: string }).id,
          status: 'active',
          verification: proof,
          replacesOriginal: true,
          coverageStart: today,
          coverageEnd: '2026-11-30',
          installments: [
            { id: randomUUID(), date: '2026-10-23', principalCents: 5000 },
            { id: randomUUID(), date: '2026-10-28', principalCents: 5000 },
          ],
        }),
      ),
    ],
  }
  const r = smartPlanner(s, v, today)
  expect(r.forecast.spendingCents).toBe(10000)
  expect(r.forecast.outflowCents).toBe(10000)
})
it('verified court enforcement is critical while ordinary collections are not automatically flexible', () => {
  const s = smartSources(),
    v = smartInput(),
    d = fictionalDebt('Fictional collection')
  d.accountType = 'collection'
  s.debts = [d]
  s.planner = {
    records: [
      plannerRecord(
        plannerInputSchema.parse({
          kind: 'debt_plan',
          name: 'Fictional reviewed collection payment',
          target: { kind: 'debt', id: d.id },
          mode: 'pay_by_date',
          amountCents: 7500,
          startDate: today,
          deadline: '2026-10-27',
          amountBasis: 'custom',
          verification: { verified: false },
          status: 'confirmed',
        }),
      ),
    ],
  }
  expect(smartPlanner(s, v, today).items[0].priority).toBe('important')
  s.planner.records.push(
    plannerRecord(
      plannerInputSchema.parse({
        kind: 'priority',
        name: 'Verified judgment',
        target: { kind: 'debt', id: d.id },
        priority: 'flexible',
        legalOrder: true,
        consequence: 'judgment',
        deadline: '2026-10-25',
        verification: proof,
      }),
    ),
  )
  const i = smartPlanner(s, v, today).items[0]
  expect(i.priority).toBe('critical')
  expect(i.date).toBe('2026-10-25')
  expect(i.reason.join(' ')).toContain('Do not assume it can be skipped')
})
it('unknown cash and unknown obligation amounts keep the result incomplete', () => {
  const s = smartSources()
  s.bills = [fictionalBill('Fictional medical', null, '2026-10-22')]
  const r = smartPlanner(s, smartInput(null), today)
  expect(r.fullyFunded).toBe(false)
  expect(r.unknownCount).toBe(1)
  expect(r.confirmedSpendableCents).toBeNull()
})
it('preserves the safety buffer and essential reserves before optional extra repayments', () => {
  const s = smartSources(),
    v = smartInput(20000)
  s.planner = {
    records: [
      plannerRecord(
        plannerInputSchema.parse({
          kind: 'preferences',
          name: 'Living',
          essentialReserveCents: 10000,
          accountIds: [],
        }),
      ),
    ],
  }
  v.smart!.bufferCents = 5000
  v.extraDebtCents = 10000
  const r = smartPlanner(s, v, today)
  expect(r.confirmedSpendableCents).toBe(5000)
  expect(r.items[0]).toMatchObject({
    priority: 'optional',
    recommendedCents: 5000,
    unfundedCents: 5000,
  })
  expect(r.funding[0].remainingCents).toBe(0)
})
it('does not assume instant transfers across multiple accounts or treat negative cash as an overdraft facility', () => {
  const s = smartSources(),
    v = smartInput(90000)
  s.bills = [fictionalBill('Rent', 10000, '2026-10-22')]
  s.planner = { records: [] }
  v.smart!.opening = {
    ...v.smart!.opening!,
    source: 'selected_accounts',
    accounts: [
      { accountId: 'a', balanceId: 'ba', availableCents: 100000 },
      { accountId: 'b', balanceId: 'bb', availableCents: -10000 },
    ],
  }
  const r = smartPlanner(s, v, today)
  expect(r.items[0].recommendedCents).toBe(0)
  expect(r.confirmedSpendableCents).toBe(90000)
  expect(r.warnings.join(' ')).toContain('Negative available cash')
})
it('user override and dismissal keep unresolved liability visible without writing transactions', () => {
  const { sources: s, input: v, utility } = plannerFixture()
  s.planner!.records.push(
    plannerRecord(
      plannerInputSchema.parse({
        kind: 'allocation',
        name: 'Electricity decision',
        target: { kind: 'bill_period', id: utility.periods[0].id, parentId: utility.id },
        purpose: 'obligation',
        amountCents: 0,
        date: '2026-10-22',
        status: 'dismissed',
        priority: 'essential',
        explanation: 'Contact provider to verify terms',
      }),
    ),
  )
  const r = smartPlanner(s, v, today)
  expect(r.items.find((i) => i.name === 'Fictional electricity')).toMatchObject({
    dismissed: true,
    unfundedCents: 13000,
  })
  expect(s.bills[1].payments).toEqual([])
})
it('hypothetical advance affects simulated cash and fees without changing income or real sources', () => {
  const { sources: s, input: v } = plannerFixture(),
    before = JSON.stringify(s)
  v.planning = {
    essentialReserveCents: 2000,
    utilityIncreaseCents: 20000,
    hypotheticalAdvance: {
      amountCents: 10000,
      feesCents: 500,
      receivedDate: today,
      repaymentDate: '2026-10-28',
    },
  }
  const r = smartPlanner(s, v, today)
  expect(r.forecast.borrowedCents).toBe(10000)
  expect(r.forecast.incomeCents).toBe(80000)
  expect(r.feesCents).toBe(2500)
  expect(JSON.stringify(s)).toBe(before)
})
it('local pattern learning requires three completed observations and excludes missing months', () => {
  const s = smartSources(),
    b = fictionalBill('Utility', 30000, '2026-10-22')
  s.bills = [b]
  expect(plannerPatterns(s, today)).toEqual([])
  b.periods = [30000, 32000, 34000].map((n, i) => ({
    ...b.periods[0],
    id: String(i),
    dueDate: `2026-0${i + 6}-22`,
    amountCents: n,
    paymentStatus: 'paid',
  }))
  expect(plannerPatterns(s, today)[0]).toMatchObject({
    amountCents: 32000,
    sampleCount: 3,
    confidence: 'low',
  })
})
it('unverified serious consequences and fractional cents are rejected', () => {
  const p = {
    kind: 'priority',
    name: 'Unsafe claim',
    target: { kind: 'debt', id: randomUUID() },
    priority: 'critical',
    legalOrder: true,
    verification: { verified: false },
  }
  expect(plannerInputSchema.safeParse(p).success).toBe(false)
  expect(
    plannerInputSchema.safeParse({
      kind: 'preferences',
      name: 'Reserve',
      essentialReserveCents: 0.5,
      accountIds: [],
    }).success,
  ).toBe(false)
})
it('default child-support priority requires verification before claiming legal consequences', () => {
  const s = smartSources(),
    d = fictionalDebt('Support')
  d.accountType = 'child_support'
  s.debts = [d]
  const r = smartPlanner(s, smartInput(), today)
  expect(r.items[0].priority).toBe('critical')
  expect(r.items[0].consequence).toBeNull()
})
it.each([1000, 2000, 3000])(
  'smaller paycheck %s basis points reduces only expected money',
  (reductionBps) => {
    const { sources: s, input: v } = plannerFixture()
    v.smart!.incomeAdjustments = [
      { eventId: 'payroll:week', delayDays: 0, reductionBps, excluded: false },
    ]
    expect(smartPlanner(s, v, today).forecast.incomeCents).toBe(80000 * (1 - reductionBps / 10000))
  },
)
it('confirmed payroll cannot be replaced by a saved forecast', () => {
  const s = smartSources()
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek()]
  s.income.transactions = [
    smartIncome({ status: 'confirmed', actualNetCents: 82000, depositDate: '2026-10-23' }),
  ]
  s.payroll[0].incomeTransactionId = 'income'
  const r = forecast(s, smartInput(), '2026-10-23')
  expect(r.events.filter((e) => e.direction === 'in')).toHaveLength(1)
  expect(r.incomeCents).toBe(82000)
})
