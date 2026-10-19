import { it, expect } from 'vitest'
import { openSqlite } from '../../db/encryption/sqlite-engine'
import { testRequest, testUser } from '../../testing/workspace'
import { setup, accountInput, create } from './trading.fixture'

it.each([false, true])(
  'creates independent accounts atomically and replays safely across restart; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted)
    const input = create(
      Array.from({ length: 4 }, (_, i) => ({
        ...accountInput(f.member, `Account ${i + 1}`),
        maskedExternalId: String(1000 + i),
      })),
    )
    const first = (await f.ok('POST', '/trading/accounts/batch', input)).records
    expect(first).toHaveLength(4)
    expect(new Set(first.map((a: { id: string }) => a.id)).size).toBe(4)
    for (const a of first) {
      expect(a.reportedBalanceCents).toBeNull()
      expect(a.incomeSourceId).toBeNull()
      expect(a.ruleSnapshots).toEqual([])
    }
    expect(
      (await f.ok('POST', '/trading/accounts/batch', input)).records.map(
        (a: { id: string }) => a.id,
      ),
    ).toEqual(first.map((a: { id: string }) => a.id))
    expect(
      (await f.send('POST', '/trading/accounts/batch', { ...input, values: input.values.slice(1) }))
        .statusCode,
    ).toBe(409)
    const data = await f.ok('GET', '/trading')
    expect(data.accounts).toHaveLength(4)
    expect(data.results).toEqual([])
    expect(data.payouts).toEqual([])
    const next = await f.restart()
    const replay = await testRequest(
      next,
      'POST',
      f.base + '/trading/accounts/batch',
      f.owner.cookie,
      input,
    )
    expect(replay.statusCode).toBe(201)
    expect(replay.json().records.map((a: { id: string }) => a.id)).toEqual(
      first.map((a: { id: string }) => a.id),
    )
  },
  20000,
)

it('rolls back every account and audit when a later insert fails', async () => {
  const f = await setup(false)
  const sqlite = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    sqlite.exec(
      "CREATE TRIGGER reject_test_account BEFORE INSERT ON trading_accounts WHEN NEW.nickname = 'Rejected test account' BEGIN SELECT RAISE(ABORT, 'Test failure'); END",
    )
    const response = await f.send(
      'POST',
      '/trading/accounts/batch',
      create([accountInput(f.member), accountInput(f.member, 'Rejected test account')]),
    )
    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect((await f.ok('GET', '/trading')).accounts).toEqual([])
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM trading_audit').get()).toEqual({
      count: 0,
    })
  } finally {
    sqlite.close()
  }
})

it('validates counts and names and enforces every account permission before saving', async () => {
  const f = await setup(false)
  for (const values of [
    [],
    Array.from({ length: 21 }, (_, i) => accountInput(f.member, String(i))),
    [accountInput(f.member, 'Repeated'), accountInput(f.member, ' repeated ')],
  ]) {
    expect((await f.send('POST', '/trading/accounts/batch', create(values))).statusCode).toBe(400)
  }
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const actor = await testUser(f.app, role),
      member = f.grant(actor.id, role)
    const own = create([accountInput(member, role + ' 1'), accountInput(member, role + ' 2')])
    expect((await f.send('POST', '/trading/accounts/batch', own, actor.cookie)).statusCode).toBe(
      role === 'viewer' ? 403 : 201,
    )
    expect(
      (
        await f.send(
          'POST',
          '/trading/accounts/batch',
          create([
            accountInput(member, 'Own candidate'),
            accountInput(f.member, 'Owner candidate'),
          ]),
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
  }
  const outsider = await testUser(f.app, 'Outside')
  expect(
    (
      await f.send(
        'POST',
        '/trading/accounts/batch',
        create([accountInput(f.member)]),
        outsider.cookie,
      )
    ).statusCode,
  ).toBe(404)
  expect((await f.ok('GET', '/trading')).accounts).toHaveLength(4)
}, 20000)
