import { it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { tradingPerformance } from '@goxfinance/shared'
import { testRequest, testUser } from '../../testing/workspace'
import { openSqlite } from '../../db/encryption/sqlite-engine'
import { setup, accountInput, payoutInput, goalInput, create, edit } from './trading.fixture'
it.each([false, true])(
  'tracks independent accounts, negative results and audited corrections; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      a = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record,
      b = (
        await f.ok('POST', '/trading/accounts', create(accountInput(f.member, 'Second account')))
      ).record
    const input = create({
      accountId: a.id,
      sessionAt: '2026-10-10T20:00:00Z',
      grossCents: 10000,
      feesCents: 2000,
      tradeCount: 2,
      notes: null,
    })
    const r = (await f.ok('POST', '/trading/results', input)).record
    await f.ok('POST', '/trading/results', input)
    expect((await f.send('POST', '/trading/results', create(input.values))).statusCode).toBe(409)
    await f.ok(
      'POST',
      '/trading/results',
      create({ ...input.values, accountId: b.id, grossCents: -5000, feesCents: 1000 }),
    )
    let data = await f.ok('GET', '/trading')
    expect(data.results).toHaveLength(2)
    expect(tradingPerformance(data.results, [a.id, b.id])[0].netCents).toBe(2000)
    await f.ok(
      'PATCH',
      '/trading/results/' + r.id,
      edit(r.revision, { ...input.values, grossCents: -10000 }),
    )
    expect(
      (await f.send('PATCH', '/trading/results/' + r.id, edit(r.revision, input.values)))
        .statusCode,
    ).toBe(409)
    data = await f.ok('GET', '/trading')
    expect(tradingPerformance(data.results, [a.id, b.id])[0].netCents).toBe(-18000)
    expect((await f.ok('GET', '/trading/audit/' + r.id)).audit).toHaveLength(2)
    const next = await f.restart(),
      reloaded = await testRequest(next, 'GET', f.base + '/trading', f.owner.cookie)
    expect(reloaded.json().results).toHaveLength(2)
    expect(reloaded.json().accounts[0].reportedBalanceCents).toBeNull()
  },
  20000,
)
it('enforces protected Owner and household permissions for accounts, groups, payouts and goals', async () => {
  const f = await setup(false),
    account = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const actor = await testUser(f.app, role),
      member = f.grant(actor.id, role)
    expect(
      (
        await f.send(
          'PATCH',
          '/trading/accounts/' + account.id,
          edit(account.revision, accountInput(f.member)),
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (await f.send('POST', '/trading/payouts', create(payoutInput(account.id)), actor.cookie))
        .statusCode,
    ).toBe(403)
    expect(
      (
        await f.send(
          'POST',
          '/goals',
          create({ ...goalInput(f.member), responsibleMemberId: null }),
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
    const own = await f.send(
      'POST',
      '/trading/accounts',
      create(accountInput(member, role + ' account')),
      actor.cookie,
    )
    expect(own.statusCode).toBe(role === 'viewer' ? 403 : 201)
    if (role !== 'viewer')
      expect(
        (
          await f.send(
            'POST',
            '/trading/groups',
            create({
              name: 'Unauthorized group',
              leadAccountId: account.id,
              status: 'active',
              members: [
                { accountId: account.id, quantityMultiplier: '1' },
                { accountId: own.json().record.id, quantityMultiplier: '1' },
              ],
            }),
            actor.cookie,
          )
        ).statusCode,
      ).toBe(403)
  }
  const outsider = await testUser(f.app, 'Outsider')
  expect((await f.send('GET', '/trading', undefined, outsider.cookie)).statusCode).toBe(404)
  expect(
    (
      await f.send(
        'POST',
        '/trading/results',
        create({
          accountId: randomUUID(),
          sessionAt: '2026-10-10T20:00:00Z',
          grossCents: 0,
          feesCents: 0,
          tradeCount: null,
          notes: null,
        }),
      )
    ).statusCode,
  ).toBe(404)
  const sqlite = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
  } finally {
    sqlite.close()
  }
}, 20000)
