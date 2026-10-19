import { it, expect } from 'vitest'
import { testHome, testRequest, testUser } from '../../testing/workspace'
import { openSqlite } from '../../db/encryption/sqlite-engine'
import { setup, accountInput, goalInput, create } from './trading.fixture'
it('rejects real cross-household account/group links through the API and database', async () => {
  const f = await setup(false),
    other = await testUser(f.app, 'Other'),
    foreign = await testHome(f.app, other.cookie)
  const account = (
    await testRequest(
      f.app,
      'POST',
      `/api/households/${foreign.home}/trading/accounts`,
      other.cookie,
      create(accountInput(foreign.member)),
    )
  ).json().record
  const second = (
    await testRequest(
      f.app,
      'POST',
      `/api/households/${foreign.home}/trading/accounts`,
      other.cookie,
      create(accountInput(foreign.member, 'Second foreign account')),
    )
  ).json().record
  const group = (
    await testRequest(
      f.app,
      'POST',
      `/api/households/${foreign.home}/trading/groups`,
      other.cookie,
      create({
        name: 'Foreign group',
        leadAccountId: account.id,
        status: 'active',
        members: [
          { accountId: account.id, quantityMultiplier: '1' },
          { accountId: second.id, quantityMultiplier: '1' },
        ],
      }),
    )
  ).json().record
  expect(
    (
      await f.send(
        'POST',
        '/trading/results',
        create({
          accountId: account.id,
          sessionAt: '2026-10-10T20:00:00Z',
          grossCents: 0,
          feesCents: 0,
          tradeCount: null,
          notes: null,
        }),
      )
    ).statusCode,
  ).toBe(404)
  expect(
    (await f.send('POST', '/goals', create({ ...goalInput(f.member), copyGroupId: group.id })))
      .statusCode,
  ).toBe(400)
  const goal = (await f.ok('POST', '/goals', create(goalInput(f.member)))).record
  const sqlite = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    expect(() =>
      sqlite
        .prepare('UPDATE financial_goals SET copy_group_id=? WHERE id=?')
        .run(group.id, goal.id),
    ).toThrow()
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
  } finally {
    sqlite.close()
  }
})
