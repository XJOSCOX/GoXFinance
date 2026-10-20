import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { setup } from '../trading/trading.fixture'
import { testRequest, testUser } from '../../testing/workspace'
import { openSqlite } from '../../db/encryption/sqlite-engine'
const input = {
  name: 'Fictional scenario',
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  startingCents: 10000,
  confidence: 'estimated',
  mode: 'expected',
  income: [],
  variableSpendingCents: 20000,
  extraDebtCents: 0,
  includeSettlements: false,
  includeUncertainPayouts: false,
  oneTime: [],
}
it.each([false, true])(
  'saves audited immutable scenario snapshots and persists after restart; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      data = await f.ok('GET', '/forecasts'),
      body = { idempotencyKey: randomUUID(), fingerprint: data.fingerprint, values: input },
      record = (await f.ok('POST', '/forecasts', body)).record
    expect((await f.ok('POST', '/forecasts', body)).record.id).toBe(record.id)
    expect(
      (await f.send('POST', '/forecasts', { ...body, values: { ...input, name: 'Changed' } }))
        .statusCode,
    ).toBe(409)
    const next = await f.restart(),
      saved = (await testRequest(next, 'GET', f.base + '/forecasts', f.owner.cookie)).json()
        .scenarios[0]
    expect(saved.report).toMatchObject({ endingCents: -10000, incomeCents: 0, outflowCents: 20000 })
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(db.prepare('select count(*) as n from forecast_audit').get()).toEqual({ n: 1 })
    } finally {
      db.close()
    }
  },
)
it('rejects stale source snapshots, Viewer writes, cross-household access and invalid input', async () => {
  const f = await setup(false),
    data = await f.ok('GET', '/forecasts'),
    body = { idempotencyKey: randomUUID(), fingerprint: data.fingerprint, values: input }
  const viewer = await testUser(f.app, 'viewer')
  f.grant(viewer.id, 'viewer')
  expect((await f.send('POST', '/forecasts', body, viewer.cookie)).statusCode).toBe(403)
  const outsider = await testUser(f.app, 'outsider')
  expect((await f.send('GET', '/forecasts', undefined, outsider.cookie)).statusCode).toBe(404)
  expect(
    (await f.send('POST', '/forecasts', { ...body, fingerprint: '0'.repeat(64) })).statusCode,
  ).toBe(409)
  expect(
    (await f.send('POST', '/forecasts', { ...body, values: { ...input, endDate: '2020-01-01' } }))
      .statusCode,
  ).toBe(400)
  expect((await f.ok('GET', '/forecasts')).scenarios).toEqual([])
})
it('rolls back a failed audit write without retaining a scenario', async () => {
  const f = await setup(false),
    data = await f.ok('GET', '/forecasts'),
    db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER reject_forecast BEFORE INSERT ON forecast_audit BEGIN SELECT RAISE(ABORT,'fictional rollback');END;",
    )
    expect(
      (
        await f.send('POST', '/forecasts', {
          idempotencyKey: randomUUID(),
          fingerprint: data.fingerprint,
          values: input,
        })
      ).statusCode,
    ).toBe(500)
    expect(db.prepare('select count(*) as n from forecast_scenarios').get()).toEqual({ n: 0 })
  } finally {
    db.close()
  }
})
