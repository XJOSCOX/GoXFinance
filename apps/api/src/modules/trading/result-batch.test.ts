import { it, expect } from 'vitest'
import { testRequest, testUser } from '../../testing/workspace'
import { setup, accountInput, create } from './trading.fixture'

it.each([false, true])(
  'records different daily results once, atomically, with restart persistence; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted)
    const accounts = (
      await f.ok(
        'POST',
        '/trading/accounts/batch',
        create(Array.from({ length: 4 }, (_, i) => accountInput(f.member, `Account ${i}`))),
      )
    ).records
    const input = create(
      accounts.map((a: { id: string }, i: number) => ({
        accountId: a.id,
        sessionAt: '2026-10-10T20:00:00Z',
        grossCents: [10000, -5000, 0, 3000][i],
        feesCents: 100,
        tradeCount: null,
        notes: null,
      })),
    )
    const first = (await f.ok('POST', '/trading/results/batch', input)).records
    expect(first.map((r: { netCents: number }) => r.netCents)).toEqual([9900, -5100, -100, 2900])
    await f.ok('POST', '/trading/results/batch', input)
    expect((await f.ok('GET', '/trading')).results).toHaveLength(4)
    expect((await f.send('POST', '/trading/results/batch', create(input.values))).statusCode).toBe(
      409,
    )
    const collision = create([
      { ...input.values[0], sessionAt: '2026-10-11T20:00:00Z' },
      input.values[1],
    ])
    expect((await f.send('POST', '/trading/results/batch', collision)).statusCode).toBe(409)
    expect((await f.ok('GET', '/trading')).results).toHaveLength(4)
    expect(
      (await f.send('POST', '/trading/results/batch', create([input.values[0], input.values[0]])))
        .statusCode,
    ).toBe(400)
    const next = await f.restart()
    const data = (await testRequest(next, 'GET', f.base + '/trading', f.owner.cookie)).json()
    expect(data.results).toHaveLength(4)
    expect(data.payouts).toEqual([])
  },
  20000,
)

it('authorizes every result in a batch and cannot write Owner results as Admin, Editor or Viewer', async () => {
  const f = await setup(false)
  const ownerAccount = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member))))
    .record
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const actor = await testUser(f.app, role),
      member = f.grant(actor.id, role)
    const own = (await f.ok('POST', '/trading/accounts', create(accountInput(member, role)))).record
    const values = [own, ownerAccount].map((a) => ({
      accountId: a.id,
      sessionAt: '2026-10-10T20:00:00Z',
      grossCents: 0,
      feesCents: 0,
      tradeCount: null,
      notes: null,
    }))
    expect(
      (await f.send('POST', '/trading/results/batch', create(values), actor.cookie)).statusCode,
    ).toBe(403)
    expect(
      (await f.send('POST', '/trading/results/batch', create(values.slice(0, 1)), actor.cookie))
        .statusCode,
    ).toBe(role === 'viewer' ? 403 : 201)
  }
  const outsider = await testUser(f.app, 'Outsider')
  expect(
    (
      await f.send(
        'POST',
        '/trading/results/batch',
        create([
          {
            accountId: ownerAccount.id,
            sessionAt: '2026-10-10T20:00:00Z',
            grossCents: 0,
            feesCents: 0,
            tradeCount: null,
            notes: null,
          },
        ]),
        outsider.cookie,
      )
    ).statusCode,
  ).toBe(404)
  expect((await f.ok('GET', '/trading')).results).toHaveLength(2)
}, 20000)
