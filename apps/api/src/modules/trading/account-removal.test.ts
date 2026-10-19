import { it, expect } from 'vitest'
import { testRequest, testUser } from '../../testing/workspace'
import { setup, accountInput, create, payoutInput } from './trading.fixture'

it.each([false, true])(
  'hides and restores accounts while retaining results after restart; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted)
    const a = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record
    await f.ok(
      'POST',
      '/trading/results',
      create({
        accountId: a.id,
        sessionAt: '2026-10-10T20:00:00Z',
        grossCents: 12000,
        feesCents: 1000,
        tradeCount: null,
        notes: null,
      }),
    )
    const remove = (body: object) =>
      testRequest(f.app, 'DELETE', f.base + '/trading/accounts/' + a.id, f.owner.cookie, body)
    expect((await remove({ revision: a.revision, permanent: true })).statusCode).toBe(409)
    const hidden = await remove({ revision: a.revision })
    expect(hidden.statusCode).toBe(200)
    expect(hidden.json().record.deletedAt).toBeTruthy()
    expect((await remove({ revision: a.revision })).statusCode).toBe(409)
    expect((await f.send('POST', '/trading/payouts', create(payoutInput(a.id)))).statusCode).toBe(
      409,
    )
    const next = await f.restart()
    const data = (await testRequest(next, 'GET', f.base + '/trading', f.owner.cookie)).json()
    expect(data.accounts[0].deletedAt).toBeTruthy()
    expect(data.results[0].netCents).toBe(11000)
    const restored = await testRequest(
      next,
      'POST',
      f.base + '/trading/accounts/' + a.id + '/restore',
      f.owner.cookie,
      { revision: data.accounts[0].revision },
    )
    expect(restored.statusCode).toBe(200)
    expect(restored.json().record.deletedAt).toBeNull()
  },
  20000,
)

it('permanently deletes an extra empty account without modifying the original or recreating it on retry', async () => {
  const f = await setup(false)
  const original = (
    await f.ok('POST', '/trading/accounts', create(accountInput(f.member, 'Original')))
  ).record
  const input = create([accountInput(f.member, 'Extra 1'), accountInput(f.member, 'Extra 2')])
  const extras = (await f.ok('POST', '/trading/accounts/batch', input)).records
  const response = await testRequest(
    f.app,
    'DELETE',
    f.base + '/trading/accounts/' + extras[0].id,
    f.owner.cookie,
    { revision: 1, permanent: true },
  )
  expect(response.statusCode).toBe(200)
  expect((await f.ok('GET', '/trading')).accounts.map((a: { id: string }) => a.id)).toEqual([
    original.id,
    extras[1].id,
  ])
  expect((await f.ok('GET', '/trading/audit/' + extras[0].id)).audit.at(-1).action).toBe(
    'account_permanently_deleted',
  )
  expect((await f.send('POST', '/trading/accounts/batch', input)).statusCode).toBe(404)
  expect((await f.ok('GET', '/trading')).accounts).toHaveLength(2)
})

it('protects Owner accounts and household boundaries for both deletion modes', async () => {
  const f = await setup(false)
  const a = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const actor = await testUser(f.app, role),
      member = f.grant(actor.id, role)
    for (const permanent of [false, true]) {
      expect(
        (
          await testRequest(f.app, 'DELETE', f.base + '/trading/accounts/' + a.id, actor.cookie, {
            revision: 1,
            permanent,
          })
        ).statusCode,
      ).toBe(403)
    }
    if (role !== 'viewer') {
      const own = (
        await f.ok('POST', '/trading/accounts', create(accountInput(member)), actor.cookie)
      ).record
      expect(
        (
          await testRequest(f.app, 'DELETE', f.base + '/trading/accounts/' + own.id, actor.cookie, {
            revision: 1,
            permanent: true,
          })
        ).statusCode,
      ).toBe(200)
    }
  }
  const outsider = await testUser(f.app, 'Outsider')
  expect(
    (
      await testRequest(f.app, 'DELETE', f.base + '/trading/accounts/' + a.id, outsider.cookie, {
        revision: 1,
        permanent: true,
      })
    ).statusCode,
  ).toBe(404)
  expect((await f.ok('GET', '/trading')).accounts).toHaveLength(1)
}, 20000)
