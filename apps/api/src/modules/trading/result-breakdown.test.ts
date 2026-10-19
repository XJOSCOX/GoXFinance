import { it, expect } from 'vitest'
import { setup, accountInput, create, edit } from './trading.fixture'
import { testUser, testRequest } from '../../testing/workspace'
it.each([false, true])(
  'preserves split results, corrections, audited deletion and retired submissions after restart; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted)
    const a = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record
    const values = {
      accountId: a.id,
      sessionAt: '2026-10-10T20:00:00Z',
      profitCents: 35000,
      lossCents: 10000,
      grossCents: 25000,
      feesCents: 123,
      tradeCount: null,
      notes: null,
    }
    const input = create(values)
    const r = (await f.ok('POST', '/trading/results', input)).record
    expect(r.netCents).toBe(24877)
    expect((await f.ok('POST', '/trading/results', input)).record.id).toBe(r.id)
    for (const change of [{ lossCents: -1 }, { grossCents: 0 }, { profitCents: null }])
      expect(
        (await f.send('POST', '/trading/results', create({ ...values, ...change }))).statusCode,
      ).toBe(400)
    const corrected = (
      await f.ok(
        'PATCH',
        `/trading/results/${r.id}`,
        edit(1, { ...values, lossCents: 40000, grossCents: -5000 }),
      )
    ).record
    expect(corrected.netCents).toBe(-5123)
    expect(
      (await f.send('DELETE', `/trading/results/${r.id}`, edit(1, { confirmation: 'DELETE' })))
        .statusCode,
    ).toBe(409)
    const app = await f.restart()
    expect(
      (await testRequest(app, 'GET', f.base + '/trading', f.owner.cookie)).json().results[0]
        .profitCents,
    ).toBe(35000)
    const removed = await testRequest(
      app,
      'DELETE',
      f.base + `/trading/results/${r.id}`,
      f.owner.cookie,
      edit(2, { confirmation: 'DELETE' }),
    )
    expect(removed.statusCode).toBe(200)
    expect(
      (await testRequest(app, 'GET', f.base + '/trading', f.owner.cookie)).json().results,
    ).toEqual([])
    const audit = (
      await testRequest(app, 'GET', f.base + `/trading/audit/${r.id}`, f.owner.cookie)
    ).json().audit
    expect(audit.map((row: { action: string }) => row.action)).toContain('result_deleted')
    expect(
      (await testRequest(app, 'POST', f.base + '/trading/results', f.owner.cookie, input))
        .statusCode,
    ).toBe(409)
  },
  20000,
)
it('protects Owner results against deletion by Admin, Editor, Viewer and outsiders', async () => {
  const f = await setup(false)
  const a = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record
  const r = (
    await f.ok(
      'POST',
      '/trading/results',
      create({
        accountId: a.id,
        sessionAt: '2026-10-10T20:00:00Z',
        grossCents: 100,
        feesCents: 0,
        tradeCount: null,
        notes: null,
      }),
    )
  ).record
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const actor = await testUser(f.app, role)
    f.grant(actor.id, role)
    expect(
      (
        await f.send(
          'DELETE',
          `/trading/results/${r.id}`,
          edit(1, { confirmation: 'DELETE' }),
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
  }
  const outsider = await testUser(f.app, 'outside')
  expect(
    (
      await f.send(
        'DELETE',
        `/trading/results/${r.id}`,
        edit(1, { confirmation: 'DELETE' }),
        outsider.cookie,
      )
    ).statusCode,
  ).toBe(404)
  expect((await f.ok('GET', '/trading')).results).toHaveLength(1)
}, 20000)
