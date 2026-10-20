import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { netWorth } from '@goxfinance/shared'
import { setup, create, edit } from '../trading/trading.fixture'
import { testRequest, testUser } from '../../testing/workspace'
import { openSqlite } from '../../db/encryption/sqlite-engine'
const valuation = {
  valueCents: 1000000,
  valuationDate: '2026-10-01',
  source: 'Fictional estimate',
  confidence: 'estimated',
  notes: null,
  supersedesId: null,
}
const input = (member: string) => ({
  name: 'Fictional car',
  category: 'vehicle',
  memberIds: [member],
  debtIds: [],
  acquisitionDate: null,
  purchaseCents: 2500000,
  notes: null,
  status: 'active',
  valuation,
})
it.each([false, true])(
  'persists asset CRUD, corrected valuations and immutable net-worth snapshots; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      v = input(f.member),
      body = create(v),
      asset = (await f.ok('POST', '/assets', body)).record
    expect((await f.ok('POST', '/assets', body)).record.id).toBe(asset.id)
    const initial = await f.ok('GET', '/assets'),
      valueBody = {
        idempotencyKey: randomUUID(),
        revision: 1,
        values: { ...valuation, valueCents: 900000, supersedesId: initial.valuations[0].id },
        reason: 'Correct fictional value',
      }
    await f.ok('POST', '/assets/' + asset.id + '/valuations', valueBody)
    await f.ok('POST', '/assets/' + asset.id + '/valuations', valueBody)
    expect(
      (await f.send('PATCH', '/assets/' + asset.id, edit(1, { ...v, valuation: undefined })))
        .statusCode,
    ).toBe(409)
    const data = await f.ok('GET', '/assets')
    expect(data.valuations).toHaveLength(2)
    expect(netWorth(data, '2026-10-20', null, '2026-10-20').assetCents).toBe(900000)
    await f.ok('POST', '/assets/snapshots', {
      idempotencyKey: randomUUID(),
      memberId: null,
      fingerprint: data.fingerprint,
    })
    const { valuation: unused, ...profile } = v
    void unused
    await f.ok('PATCH', '/assets/' + asset.id, edit(2, { ...profile, status: 'archived' }))
    expect(
      netWorth(await f.ok('GET', '/assets'), '2026-10-20', null, '2026-10-20').assetCents,
    ).toBe(0)
    await f.ok('PATCH', '/assets/' + asset.id, edit(3, profile))
    const next = await f.restart(),
      saved = (await testRequest(next, 'GET', f.base + '/assets', f.owner.cookie)).json()
    expect(saved.assets[0].revision).toBe(4)
    expect(saved.snapshots[0].report.assetCents).toBe(900000)
    expect(
      (
        await testRequest(next, 'GET', f.base + '/assets/' + asset.id + '/audit', f.owner.cookie)
      ).json().audit,
    ).toHaveLength(4)
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      db.close()
    }
  },
)
it('protects Owner-exclusive/joint assets, permits regular responsible members and blocks cross-household assignments', async () => {
  const f = await setup(false),
    owner = (await f.ok('POST', '/assets', create(input(f.member)))).record
  for (const role of ['admin', 'editor', 'viewer']) {
    const actor = await testUser(f.app, role),
      member = f.grant(actor.id, role),
      own = input(member)
    expect((await f.send('POST', '/assets', create(own), actor.cookie)).statusCode).toBe(
      role === 'viewer' ? 403 : 200,
    )
    const joint = (
      await f.ok('POST', '/assets', create({ ...input(f.member), memberIds: [f.member, member] }))
    ).record
    for (const id of [owner.id, joint.id])
      expect(
        (
          await f.send(
            'POST',
            `/assets/${id}/valuations`,
            { idempotencyKey: randomUUID(), revision: 1, values: valuation, reason: 'Forbidden' },
            actor.cookie,
          )
        ).statusCode,
      ).toBe(403)
    const data = await f.ok('GET', '/assets', undefined, actor.cookie)
    expect(
      (
        await f.send(
          'POST',
          '/assets/snapshots',
          { idempotencyKey: randomUUID(), memberId: null, fingerprint: data.fingerprint },
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
  }
  const outsider = await testUser(f.app, 'outside')
  expect((await f.send('GET', '/assets', undefined, outsider.cookie)).statusCode).toBe(404)
  expect((await f.send('POST', '/assets', create(input(randomUUID())))).statusCode).toBe(400)
  expect(
    (await f.send('POST', '/assets', create({ ...input(f.member), debtIds: [randomUUID()] })))
      .statusCode,
  ).toBe(404)
})
it('rejects future/invalid valuations, stale snapshots and rolls back failed audit writes', async () => {
  const f = await setup(false)
  expect(
    (
      await f.send(
        'POST',
        '/assets',
        create({ ...input(f.member), valuation: { ...valuation, valueCents: -1 } }),
      )
    ).statusCode,
  ).toBe(400)
  expect(
    (
      await f.send(
        'POST',
        '/assets',
        create({ ...input(f.member), valuation: { ...valuation, valuationDate: '2999-01-01' } }),
      )
    ).statusCode,
  ).toBe(400)
  const cash = (
    await f.ok(
      'POST',
      '/assets',
      create({
        ...input(f.member),
        category: 'checking',
        valuation: { ...valuation, valueCents: -100 },
      }),
    )
  ).record
  const data = await f.ok('GET', '/assets')
  expect(netWorth(data, '2026-10-20', null, '2026-10-20').assetCents).toBe(-100)
  expect(
    (
      await f.send('POST', '/assets/snapshots', {
        idempotencyKey: randomUUID(),
        memberId: null,
        fingerprint: '0'.repeat(64),
      })
    ).statusCode,
  ).toBe(409)
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER reject_asset_audit BEFORE INSERT ON asset_audit BEGIN SELECT RAISE(ABORT,'fictional rollback');END;",
    )
    expect(
      (
        await f.send('POST', `/assets/${cash.id}/valuations`, {
          idempotencyKey: randomUUID(),
          revision: 1,
          values: { ...valuation, valueCents: 500 },
          reason: 'Rollback',
        })
      ).statusCode,
    ).toBe(500)
    expect(db.prepare('select count(*) as n from asset_valuations').get()).toEqual({ n: 1 })
    expect(db.prepare('select revision from assets where id=?').get(cash.id)).toEqual({
      revision: 1,
    })
  } finally {
    db.close()
  }
})
