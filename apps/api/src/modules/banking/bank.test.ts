import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { setup } from '../../testing/financial-workspace'
import { testRequest, testUser } from '../../testing/workspace'
import { create, edit } from '../trading/trading.fixture'
import { openSqlite } from '../../db/encryption/sqlite-engine'
const profile = (member: string) => ({
  name: 'Fictional checking',
  institution: 'Fictional manual bank',
  type: 'checking',
  subtype: null,
  mask: '1234',
  currency: 'USD',
  memberIds: [member],
  status: 'active',
  assetId: null,
  debtId: null,
})
it.each([false, true])(
  'preserves manual bank profiles and dated balances across restart without financial entries; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      input = create(profile(f.member)),
      account = (await f.ok('POST', '/banking/accounts', input)).record
    expect((await f.ok('POST', '/banking/accounts', input)).record.id).toBe(account.id)
    await f.ok(
      'PATCH',
      '/banking/accounts/' + account.id,
      edit(1, { ...profile(f.member), status: 'hidden' }),
    )
    expect(
      (await f.send('PATCH', '/banking/accounts/' + account.id, edit(1, profile(f.member))))
        .statusCode,
    ).toBe(409)
    await f.ok('PATCH', '/banking/accounts/' + account.id, edit(2, profile(f.member)))
    const body = create({
      currentCents: -2500,
      availableCents: null,
      observedAt: '2026-10-01T12:00:00Z',
      notes: null,
    })
    await f.ok('POST', `/banking/accounts/${account.id}/balances`, body)
    await f.ok('POST', `/banking/accounts/${account.id}/balances`, body)
    await f.ok(
      'POST',
      `/banking/accounts/${account.id}/balances`,
      create({ ...body.values, currentCents: 12500, observedAt: '2026-10-02T12:00:00Z' }),
    )
    const next = await f.restart(),
      result = await testRequest(next, 'GET', f.base + '/banking', f.owner.cookie)
    expect(result.json().accounts[0]).toMatchObject({
      id: account.id,
      revision: 3,
      balance: { currentCents: 12500, availableCents: null },
      connectionStatus: 'manual',
    })
    expect(
      (
        await testRequest(
          next,
          'GET',
          f.base + `/banking/accounts/${account.id}/audit`,
          f.owner.cookie,
        )
      ).json().balances,
    ).toHaveLength(2)
    const overview = (
      await testRequest(next, 'GET', f.base + '/overview?month=2026-10', f.owner.cookie)
    ).json()
    expect(overview.actual.cashOutflowCents).toBe(0)
    expect(overview.income.confirmedCents).toBe(0)
    expect(JSON.stringify(result.json())).not.toMatch(
      /tokenCiphertext|providerAccountId|access_token/,
    )
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.prepare('SELECT COUNT(*) n FROM bank_reconciliations').get()).toEqual({ n: 0 })
      expect(() =>
        db.prepare('UPDATE bank_balance_observations SET current_cents=1.5').run(),
      ).toThrow()
    } finally {
      db.close()
    }
  },
)
it('requires Owner management, explicit active-member access and valid same-household references', async () => {
  const f = await setup(false),
    account = (await f.ok('POST', '/banking/accounts', create(profile(f.member)))).record
  let revision = 1
  for (const role of ['admin', 'editor', 'viewer']) {
    const actor = await testUser(f.app, role),
      member = f.grant(actor.id, role)
    expect((await f.ok('GET', '/banking', undefined, actor.cookie)).accounts).toHaveLength(0)
    expect(
      (await f.send('GET', `/banking/accounts/${account.id}/audit`, undefined, actor.cookie))
        .statusCode,
    ).toBe(404)
    expect(
      (await f.send('POST', '/banking/accounts', create(profile(member)), actor.cookie)).statusCode,
    ).toBe(403)
    await f.ok(
      'PATCH',
      '/banking/accounts/' + account.id,
      edit(revision++, { ...profile(f.member), memberIds: [f.member, member] }),
    )
    expect((await f.ok('GET', '/banking', undefined, actor.cookie)).accounts).toHaveLength(1)
    expect(
      (
        await f.send(
          'PATCH',
          '/banking/accounts/' + account.id,
          edit(revision, profile(member)),
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
  }
  const outsider = await testUser(f.app, 'outsider')
  expect((await f.send('GET', '/banking', undefined, outsider.cookie)).statusCode).toBe(404)
  expect(
    (
      await f.send(
        'POST',
        '/banking/accounts',
        create({ ...profile(f.member), memberIds: [randomUUID()] }),
      )
    ).statusCode,
  ).toBe(400)
  expect(
    (await f.send('POST', '/banking/accounts', create({ ...profile(f.member), mask: '123456789' })))
      .statusCode,
  ).toBe(400)
  expect(
    (
      await f.send(
        'POST',
        '/banking/accounts',
        create({ ...profile(f.member), assetId: randomUUID() }),
      )
    ).statusCode,
  ).toBe(404)
  expect(
    (
      await f.send(
        'POST',
        `/banking/accounts/${account.id}/balances`,
        create({
          currentCents: 1.2,
          availableCents: null,
          observedAt: '2026-10-01T12:00:00Z',
          notes: null,
        }),
      )
    ).statusCode,
  ).toBe(400)
})
it('rolls back bank records and balances when their audit write fails', async () => {
  const f = await setup(false),
    db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER reject_bank_audit BEFORE INSERT ON bank_audit BEGIN SELECT RAISE(ABORT,'fictional rollback');END;",
    )
    expect((await f.send('POST', '/banking/accounts', create(profile(f.member)))).statusCode).toBe(
      500,
    )
    expect((await f.ok('GET', '/banking')).accounts).toEqual([])
  } finally {
    db.close()
  }
})
