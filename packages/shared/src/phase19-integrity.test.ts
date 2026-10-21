import { expect, it } from 'vitest'
import { forecast } from './forecast-calculations'
import { forecastNotices } from './forecast-warnings'
import { smartPlanner } from './planner-engine'
import { plannerInputSchema } from './planner'
import {
  fictionalBill,
  fictionalDebt,
  plannerFixture,
  plannerRecord,
  proof,
} from './planner.fixture'
import {
  smartIncome,
  smartInput,
  smartSource,
  smartSources,
  smartWeek,
} from './smart-forecast.fixture'

const today = '2026-10-20'

it('uses a verified accepted settlement schedule without requiring superseded unknown minimums', () => {
  const s = smartSources(),
    v = smartInput(100000)
  v.endDate = '2026-10-29'
  v.includeSettlements = true
  const debt = fictionalDebt('Fictional settled collection')
  debt.minimumPaymentCents = null
  debt.dueDay = null
  debt.nextDueDate = null
  s.debts = [debt]
  s.offers = [
    {
      id: 'accepted-offer',
      debtId: debt.id,
      creditor: debt.creditorName,
      status: 'accepted',
      writtenConfirmed: true,
      offerDate: '2026-10-01',
      schedule: [{ id: 'installment', dueDate: '2026-10-25', amountCents: 30000, paymentId: null }],
    } as never,
  ]
  // Limit the projection to the verified coverage; later liability is not assumed forgiven.
  v.endDate = '2026-10-25'
  const r = forecast(s, v, today)
  expect(r).toMatchObject({ outflowCents: 30000, endingCents: 70000, incomplete: false })
  v.endDate = '2026-11-05'
  expect(forecast(s, v, today).incomplete).toBe(true)
  s.offers[0].writtenConfirmed = false
  expect(forecast(s, v, today).incomplete).toBe(true)
})

it('does not mistake separated replacement ranges for complete coverage of an unknown schedule', () => {
  const s = smartSources(),
    v = smartInput()
  v.endDate = '2026-10-25'
  const debt = fictionalDebt('Fictional debt with missing timing')
  debt.minimumPaymentCents = null
  debt.dueDay = null
  debt.nextDueDate = null
  s.debts = [debt]
  s.plannerCoveredDebts = [
    { debtId: debt.id, start: '2026-10-20', end: '2026-10-21' },
    { debtId: debt.id, start: '2026-10-24', end: '2026-10-25' },
  ]
  expect(forecast(s, v, today).incomplete).toBe(true)
})
function assumption() {
  return {
    sourceId: 'source',
    firstPayDate: '2026-10-23',
    expectedNetCents: 70000,
    conservativeNetCents: 70000,
    optimisticNetCents: 70000,
    regularHours: null,
    overtimeHours: null,
  }
}

it('informational notes and conditional-paycheck cautions preserve a calculable balance', () => {
  const s = smartSources(),
    v = smartInput()
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek()]
  const r = forecast(s, v, today)
  expect(r).toMatchObject({ incomplete: false, endingCents: 180000, lowestCents: 100000 })
  expect(r.notices?.map((n) => n.severity)).toEqual(['informational', 'caution'])
  expect(r.smart?.risks.some((n) => n.kind === 'missing')).toBe(false)
})

it('missing amounts preserve exact known subtotals without an authoritative cash balance', () => {
  const s = smartSources()
  s.bills = [
    fictionalBill('Unknown utility', null, '2026-10-22'),
    fictionalBill('Known rent', 12345, '2026-10-23'),
  ]
  const r = forecast(s, smartInput(), today)
  expect(r).toMatchObject({ incomplete: true, endingCents: null, outflowCents: 12345 })
  expect(r.days.at(-1)?.knownSubtotalCents).toBe(87655)
  expect(r.notices?.some((n) => n.severity === 'blocking')).toBe(true)
})

it('an unknown legacy opening balance is incomplete even when no event is unknown', () => {
  const v = smartInput()
  delete v.smart
  v.startingCents = null
  expect(forecast(smartSources(), v, today)).toMatchObject({ incomplete: true, endingCents: null })
})

it('legacy snapshot warning strings remain readable without rewriting saved snapshots', () => {
  const old = { warnings: ['Legacy unresolved timing'] },
    before = JSON.stringify(old)
  expect(forecastNotices(old)).toEqual([{ message: old.warnings[0], severity: 'blocking' }])
  expect(JSON.stringify(old)).toBe(before)
})

it.each(['2026-10-21', '2026-10-25', '2026-10-27'])(
  'retains one canonical paycheck when actual payday changes to %s',
  (date) => {
    const s = smartSources(),
      v = smartInput()
    s.income.sources = [smartSource()]
    s.payroll = [smartWeek()]
    s.income.transactions = [
      smartIncome({ status: 'confirmed', payDate: date, depositDate: date, actualNetCents: 82341 }),
    ]
    v.income = [assumption()]
    const r = forecast(s, v, '2026-10-28')
    expect(r.events.filter((e) => e.kind === 'confirmed_income')).toHaveLength(1)
    expect(r.events.some((e) => e.date === '2026-10-23')).toBe(false)
    expect(r.events.find((e) => e.kind === 'confirmed_income')?.amountCents).toBe(82341)
  },
)

it('flags a moved-date recurring assumption without inventing a second paycheck', () => {
  const s = smartSources(),
    v = smartInput()
  v.endDate = '2026-10-29'
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek({ expectedPayDate: '2026-10-25' })]
  v.income = [assumption()]
  const r = forecast(s, v, today)
  expect(r.incomeCents).toBe(80000)
  expect(r.incomplete).toBe(true)
  expect(r.warnings.join(' ')).toContain('Ambiguous recurring paycheck assumption')
})

it('also rejects ambiguous changed-date fallback income in a custom forecast', () => {
  const s = smartSources(),
    v = smartInput()
  delete v.smart
  v.startingCents = 100000
  v.endDate = '2026-10-29'
  v.income = [assumption()]
  s.income.sources = [smartSource()]
  s.income.transactions = [
    smartIncome({
      status: 'confirmed',
      payDate: '2026-10-21',
      depositDate: '2026-10-21',
      actualNetCents: 82341,
    }),
  ]
  const r = forecast(s, v, '2026-10-21')
  expect(r.incomeCents).toBe(82341)
  expect(r.incomplete).toBe(true)
  expect(r.warnings.join(' ')).toContain('Ambiguous recurring paycheck assumption')
})

it('preserves distinct confirmed ledger deposits and exposes overlapping work-period ambiguity', () => {
  const s = smartSources(),
    v = smartInput()
  v.smart!.opening!.effectiveDate = '2026-10-19'
  v.smart!.opening!.effectiveAt = '2026-10-19T08:00:00-05:00'
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek()]
  s.income.transactions = [
    smartIncome({ status: 'confirmed', depositDate: today, actualNetCents: 80000 }),
    smartIncome({
      id: 'second-actual',
      status: 'confirmed',
      depositDate: today,
      actualNetCents: 10000,
    }),
  ]
  const before = JSON.stringify(s),
    r = forecast(s, v, today)
  expect(r.incomeCents).toBe(90000)
  expect(r.incomplete).toBe(true)
  expect(r.events.filter((e) => e.kind === 'confirmed_income')).toHaveLength(2)
  s.payroll = []
  expect(forecast(s, v, today).incomeCents).toBe(90000)
  expect(forecast(s, v, today).incomplete).toBe(true)
  s.payroll = [smartWeek()]
  expect(JSON.stringify(s)).toBe(before)
})

it('keeps two employers on the same payday and historical weeks distinct', () => {
  const s = smartSources(),
    v = smartInput()
  s.income.sources = [
    smartSource(),
    { ...smartSource('monthly'), id: 'military', name: 'Fictional military' },
  ]
  s.payroll = [
    smartWeek(),
    smartWeek({ id: 'military-week', sourceId: 'military' }),
    smartWeek({
      id: 'historical',
      workweekStart: '2026-10-05',
      workweekEnd: '2026-10-11',
      expectedPayDate: '2026-10-16',
      incomeTransactionId: 'older-income',
    }),
  ]
  s.income.transactions = [
    smartIncome({
      id: 'older-income',
      status: 'confirmed',
      depositDate: '2026-10-16',
      workPeriodStart: '2026-10-05',
      workPeriodEnd: '2026-10-11',
      actualNetCents: 75000,
    }),
  ]
  const r = forecast(s, v, today)
  expect(r.incomeCents).toBe(160000)
  expect(r.events.filter((e) => e.date === '2026-10-23')).toHaveLength(2)
})

it('protects a deficit created after opening cash before allocating the next paycheck', () => {
  const s = smartSources(),
    v = smartInput(10000)
  v.smart!.opening!.effectiveDate = '2026-10-18'
  v.smart!.opening!.effectiveAt = '2026-10-18T08:00:00-05:00'
  v.smart!.bufferCents = 0
  s.planner = { records: [] }
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek()]
  s.bills = [
    fictionalBill('Past paid bill', 20000, '2026-10-19'),
    fictionalBill('Next rent', 80000, '2026-10-24'),
  ]
  s.bills[0].payments = [
    {
      id: 'actual-paid',
      billId: s.bills[0].id,
      periodId: s.bills[0].periods[0].id,
      amountCents: 20000,
      paymentDate: '2026-10-19',
      status: 'completed',
      method: 'cash',
      debtPaymentId: null,
    } as never,
  ]
  s.bills[0].periods[0].paidCents = 20000
  s.bills[0].periods[0].remainingCents = 0
  s.bills[0].periods[0].paymentStatus = 'paid'
  const r = smartPlanner(s, v, today)
  expect(r.items.find((i) => i.name === 'Next rent')).toMatchObject({
    recommendedCents: 70000,
    unfundedCents: 10000,
  })
  expect(r.forecast.endingCents).toBe(-10000)
  expect(r.fullyFunded).toBe(false)
})

it('does not spend an essential reserve from the next paycheck when opening cash is insufficient', () => {
  const s = smartSources(),
    v = smartInput(0)
  v.smart!.bufferCents = 0
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek()]
  s.bills = [fictionalBill('Rent', 80000, '2026-10-24')]
  s.planner = {
    records: [
      plannerRecord(
        plannerInputSchema.parse({
          kind: 'preferences',
          name: 'Groceries',
          essentialReserveCents: 10000,
          accountIds: [],
        }),
      ),
    ],
  }
  const r = smartPlanner(s, v, today)
  expect(r.items[0]).toMatchObject({ recommendedCents: 70000, unfundedCents: 10000 })
  expect(r.fullyFunded).toBe(false)
})

it('evaluates verified court and shutoff constraints before discretionary priority overrides', () => {
  const s = smartSources(),
    v = smartInput(30000)
  v.smart!.bufferCents = 0
  s.bills = [
    fictionalBill('Collection', 30000, '2026-10-21'),
    fictionalBill('Electricity', 15000, '2026-10-22'),
    fictionalBill('Child support', 25000, '2026-10-22'),
  ]
  s.planner = {
    records: s.bills.map((b, i) =>
      plannerRecord(
        plannerInputSchema.parse({
          kind: 'priority',
          name: b.name,
          target: { kind: 'bill', id: b.id },
          priority: i === 0 ? 'critical' : 'optional',
          legalOrder: i === 2,
          consequence: i === 1 ? 'disconnection' : 'none',
          verification: proof,
        }),
      ),
    ),
  }
  const r = smartPlanner(s, v, today)
  expect(r.items.map((i) => i.name)).toEqual(['Child support', 'Electricity', 'Collection'])
  expect(r.items.map((i) => i.recommendedCents)).toEqual([25000, 5000, 0])
  expect(r.items[1].reason.join(' ')).toContain('not a sufficient payment')
  expect(r.fullyFunded).toBe(false)
  expect(r.insights.some((i) => i.reason.includes('not a globally optimal'))).toBe(true)
})

it('retains split rent, cash-advance fees and two conditional payrolls through a delayed-paycheck lifecycle', () => {
  const { sources: s, input: v } = plannerFixture()
  s.income.sources.push({ ...smartSource('monthly'), id: 'salary', name: 'Fictional salary' })
  s.payroll!.push(
    smartWeek({ id: 'salary-week', sourceId: 'salary', expectedPayDate: '2026-10-26' }),
  )
  v.smart!.incomeAdjustments = [
    { eventId: 'payroll:week', delayDays: 2, reductionBps: 0, excluded: false },
  ]
  const before = JSON.stringify(s),
    r = smartPlanner(s, v, today)
  expect(r.forecast).toMatchObject({
    incomeCents: 160000,
    outflowCents: 140500,
    endingCents: 109500,
  })
  expect(r.forecast.events.filter((e) => e.kind === 'installment')).toHaveLength(2)
  expect(r.feesCents).toBe(2000)
  expect(r.unfundedCents).toBe(8000)
  expect(JSON.stringify(s)).toBe(before)
  s.income.transactions = [
    smartIncome({ status: 'confirmed', depositDate: '2026-10-25', actualNetCents: 82500 }),
  ]
  const actual = smartPlanner(s, v, '2026-10-25')
  expect(actual.forecast.incomeCents).toBe(162500)
  expect(actual.forecast.events.filter((e) => e.id === 'payroll:week')).toHaveLength(0)
  expect(actual.forecast.endingCents).toBe(112000)
})
