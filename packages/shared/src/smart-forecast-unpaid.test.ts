import { expect, it } from 'vitest'
import { forecast } from './forecast-calculations'
import { fictionalBill } from './planner.fixture'
import { smartInput, smartSources, smartSource, smartWeek } from './smart-forecast.fixture'

it('counts only outstanding obligations before payday while retaining completed cash history', () => {
  const sources = smartSources()
  sources.income.sources = [smartSource()]
  sources.payroll = [smartWeek()]
  const rent = fictionalBill('Fictional rent', 194720, '2026-10-20')
  rent.payments = [
    {
      id: 'paid-rent',
      periodId: rent.periods[0].id,
      amountCents: 194720,
      status: 'completed',
      paymentDate: '2026-10-20',
      method: 'cash',
      debtPaymentId: null,
    } as never,
  ]
  rent.periods[0].paidCents = 194720
  rent.periods[0].paymentStatus = 'paid'
  sources.bills = [
    rent,
    ...[30000, 22000, 66500].map((amount, n) =>
      fictionalBill(`Fictional bill ${n}`, amount, '2026-10-20'),
    ),
  ]
  const before = JSON.stringify(sources)
  const result = forecast(sources, smartInput(null), '2026-10-20')
  expect(result.smart?.billsBeforePaydayCents).toBe(118500)
  expect(result.smart?.risks.find((r) => r.kind === 'before_payday')?.amountCents).toBe(118500)
  expect(result.smart?.risks.find((r) => r.kind === 'concentration')?.amountCents).toBe(118500)
  expect(
    result.smart?.risks
      .filter((r) => ['before_payday', 'concentration'].includes(r.kind))
      .flatMap((r) => r.eventIds),
  ).not.toContain('actual:paid-rent')
  expect(result.events.find((e) => e.id === 'actual:paid-rent')?.amountCents).toBe(194720)
  expect(result.outflowCents).toBe(313220)
  expect(JSON.stringify(sources)).toBe(before)
})

it('includes pending and scheduled coverage once, and only the unpaid remainder of a partial payment', () => {
  const sources = smartSources()
  sources.income.sources = [smartSource()]
  sources.payroll = [smartWeek()]
  const bill = fictionalBill('Fictional utility', 30000, '2026-10-22')
  bill.payments = [
    { id: 'completed', status: 'completed', amountCents: 5000, paymentDate: '2026-10-20' },
    { id: 'pending', status: 'pending', amountCents: 7000, paymentDate: '2026-10-21' },
    { id: 'scheduled', status: 'scheduled', amountCents: 8000, paymentDate: '2026-10-22' },
  ].map((p) => ({
    ...p,
    periodId: bill.periods[0].id,
    method: 'cash',
    debtPaymentId: null,
  })) as never
  bill.periods[0].paidCents = 5000
  sources.bills = [bill]
  const result = forecast(sources, smartInput(null), '2026-10-20')
  expect(result.smart?.billsBeforePaydayCents).toBe(25000)
  expect(result.outflowCents).toBe(30000)
  expect(result.events.find((e) => e.id.startsWith('obligation:'))?.amountCents).toBe(10000)
})

it('does not raise unpaid warnings for paid bills without an expected payday', () => {
  const sources = smartSources()
  const bill = fictionalBill('Fictional paid bill', 12000, '2026-10-20')
  bill.payments = [
    {
      id: 'paid',
      periodId: bill.periods[0].id,
      amountCents: 12000,
      status: 'completed',
      paymentDate: '2026-10-20',
      method: 'cash',
      debtPaymentId: null,
    } as never,
  ]
  bill.periods[0].paidCents = 12000
  bill.periods[0].paymentStatus = 'paid'
  sources.bills = [bill]
  const result = forecast(sources, smartInput(null), '2026-10-20')
  expect(result.smart?.billsBeforePaydayCents).toBe(0)
  expect(result.smart?.risks.some((r) => r.kind === 'before_payday')).toBe(false)
  sources.bills.push(fictionalBill('Fictional unknown bill', null, '2026-10-22'))
  const unknown = forecast(sources, smartInput(null), '2026-10-20')
  expect(unknown.smart?.unknownBeforePayday).toBe(true)
  expect(unknown.smart?.risks.find((r) => r.kind === 'before_payday')?.amountCents).toBeNull()
})
