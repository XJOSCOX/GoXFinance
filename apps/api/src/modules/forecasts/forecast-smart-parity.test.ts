import { afterEach, expect, it, vi } from 'vitest'
import {
  localBillDate,
  smartForecastInput,
  smartPlanner,
  plannerInputSchema,
  type PublicUser,
} from '@goxfinance/shared'
import {
  fictionalBill,
  fictionalDebt,
  plannerRecord,
  proof,
} from '../../../../../packages/shared/src/planner.fixture'
import {
  smartSources,
  smartSource,
  smartWeek,
} from '../../../../../packages/shared/src/smart-forecast.fixture'
import { forecastService } from './forecast.service'
import type { ForecastRepository } from './forecast.repository'
import type { TradingPermissions } from '../trading/trading.permissions'

afterEach(() => vi.useRealTimers())
it('makes the dashboard endpoint match Planner for unpaid bills and confirmed debt plans without writing sources', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-21T17:00:00Z'))
  const today = localBillDate(),
    sources = smartSources()
  sources.planner = { records: [] }
  sources.income.sources = [smartSource()]
  sources.payroll = [smartWeek()]
  const unconfirmed = fictionalDebt('Fictional unconfirmed collection', 101300, today)
  unconfirmed.pastDueAmountCents = 4417700
  sources.debts = [unconfirmed]
  sources.bills = [30000, 22000, 66500].map((amount, n) =>
    fictionalBill(`Fictional bill ${n}`, amount, today),
  )
  const store = { settings: () => [] } as unknown as ForecastRepository
  const access = { context: () => ({ role: 'owner' }) } as unknown as TradingPermissions
  const service = forecastService(store, access, () => sources)
  const user = { id: 'fictional-owner' } as PublicUser
  const check = () => {
    const before = JSON.stringify(sources)
    const actual = service.smart(user, 'fictional-home', 30)
    expect(actual.report).toEqual(
      smartPlanner(sources, smartForecastInput(null, today, 30), today).forecast,
    )
    expect(JSON.stringify(sources)).toBe(before)
    return actual.report
  }
  expect(check().smart?.billsBeforePaydayCents).toBe(118500)
  sources.planner.records.push(
    plannerRecord(
      plannerInputSchema.parse({
        kind: 'debt_plan',
        name: 'Fictional confirmed settlement target',
        target: { kind: 'debt', id: unconfirmed.id },
        mode: 'pay_by_date',
        amountCents: 800000,
        startDate: today,
        deadline: '2026-10-22',
        amountBasis: 'custom',
        verification: proof,
        replaceOriginal: true,
        status: 'draft',
      }),
    ),
  )
  expect(check().smart?.billsBeforePaydayCents).toBe(118500)
  const plan = sources.planner.records[0].values
  if (plan.kind !== 'debt_plan') throw new Error('Invalid fictional fixture')
  plan.status = 'confirmed'
  const confirmed = check()
  expect(confirmed.smart?.billsBeforePaydayCents).toBe(918500)
  expect(confirmed.events.some((e) => e.amountCents === 4417700)).toBe(false)
})
