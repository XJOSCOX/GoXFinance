import { expect, it } from 'vitest'
import { setup, accountInput, payoutInput, create, edit } from './trading.fixture'
import { testRequest } from '../../testing/workspace'
import { openSqlite } from '../../db/encryption/sqlite-engine'

it.each([false, true])(
  'permanently retires XFA results with audit and no restoration after restart; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted)
    const input = create(accountInput(f.member))
    const a = (await f.ok('POST', '/trading/accounts', input)).record
    const result = {
      accountId: a.id,
      sessionAt: '2026-10-10T20:00:00Z',
      grossCents: 10000,
      feesCents: 0,
      tradeCount: null,
      notes: null,
    }
    const r = (await f.ok('POST', '/trading/results', create(result))).record
    expect(
      (await f.send('DELETE', '/trading/accounts/' + a.id, { revision: 2, permanent: true }))
        .statusCode,
    ).toBe(409)
    await f.ok('DELETE', '/trading/accounts/' + a.id, { revision: 1, permanent: true })
    expect((await f.ok('GET', '/trading')).accounts).toEqual([])
    expect((await f.ok('GET', '/trading')).results).toEqual([])
    expect((await f.send('PATCH', '/trading/results/' + r.id, edit(1, result))).statusCode).toBe(
      409,
    )
    expect(
      (await f.send('POST', '/trading/accounts/' + a.id + '/restore', { revision: 2 })).statusCode,
    ).toBe(409)
    expect((await f.send('POST', '/trading/accounts', input)).statusCode).toBe(409)
    expect(
      (await f.ok('GET', '/trading/audit/' + a.id)).audit.some(
        (e: { action: string }) => e.action === 'account_permanently_deleted',
      ),
    ).toBe(true)
    const restarted = await f.restart()
    const data = (await testRequest(restarted, 'GET', f.base + '/trading', f.owner.cookie)).json()
    expect(data.accounts).toEqual([])
    expect(data.results).toEqual([])
  },
  20000,
)

it.each(['requested', 'approved', 'rejected', 'cancelled'] as const)(
  'blocks permanent deletion for any payout record, including %s',
  async (status) => {
    const f = await setup(false)
    const a = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record
    await f.ok('POST', '/trading/payouts', create({ ...payoutInput(a.id), status }))
    expect(
      (await f.send('DELETE', '/trading/accounts/' + a.id, { revision: 1, permanent: true }))
        .statusCode,
    ).toBe(409)
    expect((await f.ok('GET', '/trading')).accounts).toHaveLength(1)
  },
)

it('retains shared copy-event history internally without changing the remaining account or counting retired results', async () => {
  const f = await setup(false)
  const accounts = (
    await f.ok(
      'POST',
      '/trading/accounts/batch',
      create([accountInput(f.member, 'Lead'), accountInput(f.member, 'Follower')]),
    )
  ).records
  const group = (
    await f.ok(
      'POST',
      '/trading/groups',
      create({
        name: 'Example',
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
    sessionAt: '2026-10-10T20:00:00Z',
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
  const saved = (await f.ok('POST', '/trading/events', create(event))).record
  await f.ok('DELETE', '/trading/accounts/' + accounts[0].id, { revision: 1, permanent: true })
  const data = await f.ok('GET', '/trading')
  expect(data.accounts.map((a: { id: string }) => a.id)).toEqual([accounts[1].id])
  expect(data.results).toHaveLength(1)
  expect(data.results[0].netCents).toBe(10000)
  expect(data.groups).toEqual([])
  expect(data.events[0].entries).toHaveLength(1)
  expect(data.events[0].canManage).toBe(false)
  expect(data.events[0].membershipSnapshot.members).toHaveLength(2)
  expect((await f.send('PATCH', '/trading/events/' + saved.id, edit(1, event))).statusCode).toBe(
    409,
  )
})

it('rolls back retirement if its audit fails, preserving records and foreign keys', async () => {
  const f = await setup(false)
  const a = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record
  await f.ok(
    'POST',
    '/trading/results',
    create({
      accountId: a.id,
      sessionAt: '2026-10-10T20:00:00Z',
      grossCents: 10000,
      feesCents: 0,
      tradeCount: null,
      notes: null,
    }),
  )
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER fictional_retirement_failure BEFORE INSERT ON trading_audit WHEN NEW.action = 'account_permanently_deleted' BEGIN SELECT RAISE(ABORT,'Fictional failure'); END;",
    )
    expect(
      (await f.send('DELETE', '/trading/accounts/' + a.id, { revision: 1, permanent: true }))
        .statusCode,
    ).toBe(500)
    const data = await f.ok('GET', '/trading')
    expect(data.accounts[0].revision).toBe(1)
    expect(data.accounts[0].deletedAt).toBeNull()
    expect(data.results).toHaveLength(1)
    expect(db.pragma('foreign_key_check')).toEqual([])
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
  } finally {
    db.close()
  }
})
