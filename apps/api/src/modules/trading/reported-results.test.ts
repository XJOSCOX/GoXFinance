import { expect, it } from 'vitest'
import { setup, accountInput, create, edit } from './trading.fixture'
import { testRequest } from '../../testing/workspace'
import {
  combineJournal,
  tradingPayoutProgress,
  tradingOverviewTotals,
  type TradingResult,
} from '@goxfinance/shared'

it.each([false, true])(
  'preserves reported days, net-only results and physical-session uniqueness after restart; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted)
    const a = (
      await f.ok(
        'POST',
        '/trading/accounts',
        create({
          ...accountInput(f.member),
          stage: 'combine',
          xfaPath: 'not_applicable',
          activationDate: '2026-10-09',
          sessionStart: '17:00',
        }),
      )
    ).record
    const values = {
      accountId: a.id,
      reportedDate: '2026-10-09',
      sessionAt: '2026-10-15T18:00:00Z',
      grossCents: -12345,
      feesCents: 0,
      feesIncluded: true,
      profitCents: null,
      lossCents: null,
      tradeCount: 3,
      notes: 'Fictional provider report; timestamp is entry time',
    }
    const input = create(values)
    const r = (await f.ok('POST', '/trading/results', input)).record
    expect(r).toMatchObject({
      sessionDate: '2026-10-08',
      reportedDate: '2026-10-09',
      netCents: -12345,
      feesIncluded: true,
      profitCents: null,
      tradeCount: 3,
    })
    expect((await f.ok('POST', '/trading/results', input)).record.id).toBe(r.id)
    expect((await f.send('POST', '/trading/results', create(values))).statusCode).toBe(409)
    expect(
      (
        await f.send(
          'POST',
          '/trading/results',
          create({ ...values, reportedDate: null, sessionAt: '2026-10-09T15:00:00Z' }),
        )
      ).statusCode,
    ).toBe(409)
    expect(
      (await f.send('POST', '/trading/results', create({ ...values, reportedDate: '2099-10-09' })))
        .statusCode,
    ).toBe(400)
    await f.ok('PATCH', '/trading/results/' + r.id, edit(1, { ...values, grossCents: -10000 }))
    const restarted = await f.restart()
    const data = (await testRequest(restarted, 'GET', f.base + '/trading', f.owner.cookie)).json()
    expect(data.results).toHaveLength(1)
    expect(data.results[0]).toMatchObject({
      reportedDate: '2026-10-09',
      netCents: -10000,
      revision: 2,
    })
    expect(
      combineJournal(data.accounts[0], data.results, '2026-10-20T18:00:00Z').rows[0],
    ).toMatchObject({ date: '2026-10-09', netCents: -10000 })
    expect(tradingOverviewTotals(data.results, '2026-10').netCents).toBe(-10000)
  },
  20000,
)

it('blocks a reported summary overlapping an earlier timestamp-based result, with atomic batch rollback', async () => {
  const f = await setup(false)
  const accounts = (
    await f.ok(
      'POST',
      '/trading/accounts/batch',
      create(
        [accountInput(f.member, 'A'), accountInput(f.member, 'B')].map((a) => ({
          ...a,
          sessionStart: '17:00',
        })),
      ),
    )
  ).records
  const native = {
    accountId: accounts[0].id,
    sessionAt: '2026-10-09T15:00:00Z',
    grossCents: 10000,
    feesCents: 0,
    tradeCount: null,
    notes: null,
  }
  await f.ok('POST', '/trading/results', create(native))
  const reported = { ...native, reportedDate: '2026-10-09' }
  const response = await f.send(
    'POST',
    '/trading/results/batch',
    create([{ ...reported, accountId: accounts[1].id }, reported]),
  )
  expect(response.statusCode).toBe(409)
  expect((await f.ok('GET', '/trading')).results).toHaveLength(1)
})

it("includes today's reported day in current risk and progress without ratcheting its provisional floor", async () => {
  const f = await setup(false)
  const account = (
    await f.ok(
      'POST',
      '/trading/accounts',
      create({
        ...accountInput(f.member),
        stage: 'combine',
        xfaPath: 'not_applicable',
        activationDate: '2026-10-09',
        sessionStart: '17:00',
      }),
    )
  ).record
  const rows = [
    {
      id: 'reported',
      accountId: account.id,
      sessionDate: '2026-10-18',
      reportedDate: '2026-10-19',
      netCents: 50000,
    },
  ]
  expect(combineJournal(account, rows as TradingResult[], '2026-10-19T18:00:00Z')).toMatchObject({
    floorCents: 4800000,
    balanceCents: 5050000,
  })
  expect(
    tradingPayoutProgress(account, rows as TradingResult[], [], '2026-10-19T18:00:00Z').netCents,
  ).toBe(50000)
})

it('prevents copied events and reported-day summaries from double counting the same overnight session in either order', async () => {
  const f = await setup(false)
  const accounts = (
    await f.ok(
      'POST',
      '/trading/accounts/batch',
      create(
        [accountInput(f.member, 'Copy A'), accountInput(f.member, 'Copy B')].map((a) => ({
          ...a,
          sessionStart: '17:00',
        })),
      ),
    )
  ).records
  const group = (
    await f.ok(
      'POST',
      '/trading/groups',
      create({
        name: 'Fictional group',
        status: 'active',
        leadAccountId: accounts[0].id,
        members: accounts.map((a: { id: string }) => ({
          accountId: a.id,
          quantityMultiplier: '1',
        })),
      }),
    )
  ).record
  const event = {
    groupId: group.id,
    sessionAt: '2026-10-09T15:00:00Z',
    mode: 'daily',
    instrument: null,
    direction: null,
    notes: null,
    entries: accounts.map((a: { id: string }) => ({
      accountId: a.id,
      quantity: '1',
      grossCents: 10000,
      feesCents: 0,
    })),
  }
  await f.ok('POST', '/trading/events', create(event))
  const summary = {
    accountId: accounts[0].id,
    sessionAt: '2026-10-15T18:00:00Z',
    reportedDate: '2026-10-09',
    grossCents: 10000,
    feesCents: 0,
    tradeCount: null,
    notes: null,
  }
  expect((await f.send('POST', '/trading/results', create(summary))).statusCode).toBe(409)
  await f.ok('POST', '/trading/results', create({ ...summary, reportedDate: '2026-10-10' }))
  expect(
    (
      await f.send(
        'POST',
        '/trading/events',
        create({ ...event, sessionAt: '2026-10-10T15:00:00Z' }),
      )
    ).statusCode,
  ).toBe(409)
  expect((await f.ok('GET', '/trading')).results).toHaveLength(3)
})
