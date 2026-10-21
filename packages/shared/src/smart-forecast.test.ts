import { expect, it } from 'vitest'
import { forecast } from './forecast-calculations'
import { forecastInputSchema } from './forecasts'
import {
  smartInput,
  smartSources,
  smartWeek,
  smartIncome,
  smartSource,
} from './smart-forecast.fixture'

it('selects forecast, pending transaction, reviewed statement and actual deposit in priority order', () => {
  const s = smartSources(),
    v = smartInput()
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek()]
  expect(forecast(s, v, '2026-10-20').events).toMatchObject([
    { amountCents: 80000, classification: 'payroll_forecast', modelVersion: 16, sampleCount: 5 },
  ])
  s.income.transactions = [smartIncome()]
  s.payroll[0].incomeTransactionId = 'income'
  expect(forecast(s, v, '2026-10-20').events).toMatchObject([
    { amountCents: 81000, classification: 'documented_payroll' },
  ])
  s.payroll[0].reviewedAt = '2026-10-20T10:00:00Z'
  s.payroll[0].statement = { netCents: 82000, grossCents: 105000, payDate: '2026-10-23' } as never
  expect(forecast(s, v, '2026-10-20').events).toMatchObject([
    { amountCents: 82000, classification: 'documented_payroll' },
  ])
  s.income.transactions[0] = {
    ...s.income.transactions[0],
    status: 'confirmed',
    depositDate: '2026-10-23',
    actualNetCents: 82500,
  }
  const actual = forecast(s, v, '2026-10-23')
  expect(actual.events).toHaveLength(1)
  expect(actual.events[0]).toMatchObject({
    id: 'income:income',
    amountCents: 82500,
    estimated: false,
    classification: 'confirmed_cash',
  })
  expect(actual.incomeCents).toBe(82500)
})
it.each(['weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular'] as const)(
  'uses explicit %s payroll dates and never invents unreported hours',
  (frequency) => {
    const s = smartSources()
    s.income.sources = [smartSource(frequency)]
    s.payroll = [smartWeek()]
    const r = forecast(s, smartInput(), '2026-10-20')
    expect(r.events.filter((e) => e.direction === 'in')).toHaveLength(1)
    expect(r.events[0].date).toBe('2026-10-23')
    s.payroll = []
    const unknown = forecast(s, smartInput(), '2026-10-20')
    expect(unknown.incomeCents).toBe(0)
    expect(unknown.incomplete).toBe(true)
    expect(unknown.warnings.join(' ')).toContain('Future hours and take-home are unknown')
  },
)
it('deduplicates a work period even without an explicit transaction link and keeps separate one-off income', () => {
  const s = smartSources()
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek()]
  s.income.transactions = [
    smartIncome(),
    smartIncome({
      id: 'one-off',
      workPeriodStart: null,
      workPeriodEnd: null,
      expectedNetCents: 10000,
    }),
  ]
  expect(forecast(s, smartInput(), '2026-10-20').incomeCents).toBe(91000)
})
it('suppresses approved fallback assumptions on canonical payday and preserves later assumptions as estimates', () => {
  const s = smartSources()
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek()]
  const v = smartInput()
  v.income = [
    {
      sourceId: 'source',
      firstPayDate: '2026-10-23',
      expectedNetCents: 70000,
      conservativeNetCents: 70000,
      optimisticNetCents: 70000,
      regularHours: null,
      overtimeHours: null,
    },
  ]
  const r = forecast(s, v, '2026-10-20')
  expect(r.events.filter((e) => e.date === '2026-10-23')).toHaveLength(1)
  expect(r.events.filter((e) => e.classification === 'assumed_income')).toHaveLength(3)
})
it('simulates a delayed, smaller or excluded paycheck without changing the source or historical forecast', () => {
  const s = smartSources()
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek()]
  const original = JSON.stringify(s),
    v = smartInput()
  v.smart!.incomeAdjustments = [
    { eventId: 'payroll:week', delayDays: 5, reductionBps: 3000, excluded: false },
  ]
  const r = forecast(s, v, '2026-10-20')
  expect(r.events[0]).toMatchObject({
    date: '2026-10-28',
    originalDate: '2026-10-23',
    amountCents: 56000,
  })
  expect(r.smart!.risks.some((r) => r.kind === 'delayed_payroll')).toBe(true)
  v.smart!.incomeAdjustments[0].excluded = true
  expect(forecast(s, v, '2026-10-20').incomeCents).toBe(0)
  expect(JSON.stringify(s)).toBe(original)
})
it('keeps unknown opening cash and unknown amounts separate from known net change', () => {
  const s = smartSources()
  s.income.sources = [smartSource()]
  s.payroll = [
    smartWeek({
      expectedPayDate: null,
      forecasts: [
        { createdAt: '2026-10-19', modelVersion: 1, result: { netCents: null } },
      ] as never,
    }),
  ]
  const r = forecast(s, smartInput(null), '2026-10-20')
  expect(r.endingCents).toBeNull()
  expect(r.lowestCents).toBeNull()
  expect(r.netChangeCents).toBe(0)
  expect(r.events[0].amountCents).toBeNull()
  expect(r.warnings).toContain('Opening cash balance required for a complete cash projection.')
  expect(r.warnings.join(' ')).toContain('Missing expected paycheck date')
})
it('excludes activity already in cash, carries later activity forward once and flags ambiguous same-day timing', () => {
  const s = smartSources(),
    v = smartInput()
  v.smart!.opening!.effectiveDate = '2026-10-18'
  v.smart!.opening!.effectiveAt = '2026-10-18T08:00:00-05:00'
  s.income.transactions = [
    smartIncome({ status: 'confirmed', depositDate: '2026-10-17', actualNetCents: 10000 }),
    smartIncome({
      id: 'later',
      workPeriodStart: null,
      workPeriodEnd: null,
      status: 'confirmed',
      depositDate: '2026-10-19',
      actualNetCents: 20000,
    }),
  ]
  expect(forecast(s, v, '2026-10-20')).toMatchObject({ incomeCents: 20000, endingCents: 120000 })
  s.income.transactions[1].depositDate = '2026-10-18'
  const ambiguous = forecast(s, v, '2026-10-20')
  expect(ambiguous.endingCents).toBeNull()
  expect(ambiguous.incomeCents).toBe(0)
  v.smart!.opening!.includedActivityIds = ['income:later']
  expect(forecast(s, v, '2026-10-20').endingCents).toBe(100000)
})
it('calculates buffer days, negative dates and scenario effects without treating the buffer as an expense', () => {
  const v = smartInput(30000)
  v.smart!.bufferCents = 25000
  v.oneTime = [
    {
      id: 'repair',
      date: '2026-10-21',
      name: 'Fictional repair',
      kind: 'expense',
      amountCents: 40000,
    },
  ]
  const r = forecast(smartSources(), v, '2026-10-20')
  expect(r.outflowCents).toBe(40000)
  expect(r.endingCents).toBe(-10000)
  expect(r.lowestCents).toBe(-10000)
  expect(r.shortfalls[0]).toMatchObject({ date: '2026-10-21', amountCents: 10000 })
  expect(r.smart!.daysBelowBuffer).toBe(29)
  expect(r.smart!.risks.some((r) => r.kind === 'buffer')).toBe(true)
})
it('rejects an opening date later than the projection and invalid scenario adjustments', () => {
  const v = smartInput()
  v.startDate = '2026-10-19'
  expect(forecastInputSchema.safeParse(v).success).toBe(false)
  v.startDate = '2026-10-20'
  v.smart!.incomeAdjustments = [
    { eventId: 'payroll:week', delayDays: 6, reductionBps: 3100, excluded: false },
  ]
  expect(forecastInputSchema.safeParse(v).success).toBe(false)
})

it('a confirmed receipt wins over a stale linked pending record and suppresses its old payday assumption', () => {
  const s = smartSources(),
    v = smartInput()
  s.income.sources = [smartSource()]
  s.payroll = [smartWeek({ incomeTransactionId: 'pending' })]
  s.income.transactions = [
    smartIncome({ id: 'pending' }),
    smartIncome({
      id: 'actual',
      status: 'confirmed',
      depositDate: '2026-10-24',
      actualNetCents: 84000,
    }),
  ]
  v.income = [
    {
      sourceId: 'source',
      firstPayDate: '2026-10-23',
      expectedNetCents: 70000,
      conservativeNetCents: 70000,
      optimisticNetCents: 70000,
      regularHours: null,
      overtimeHours: null,
    },
  ]
  const r = forecast(s, v, '2026-10-24')
  expect(r.events.find((e) => e.id === 'income:actual')).toMatchObject({
    amountCents: 84000,
    date: '2026-10-24',
    originalDate: '2026-10-23',
  })
  expect(r.events.some((e) => e.date === '2026-10-23')).toBe(false)
  expect(r.events.filter((e) => e.kind === 'confirmed_income')).toHaveLength(1)
})
