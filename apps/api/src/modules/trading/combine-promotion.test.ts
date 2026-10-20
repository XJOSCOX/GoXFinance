import { expect, it } from 'vitest'
import { setup, accountInput, create, edit } from './trading.fixture'
import { testRequest, testUser } from '../../testing/workspace'
import { openSqlite } from '../../db/encryption/sqlite-engine'
const promotionValues = (revision: number) => ({
  sourceRevision: revision,
  confirmedPassed: true,
  nickname: 'Fictional XFA',
  maskedExternalId: null,
  xfaPath: 'standard',
  activationDate: null,
  reportedBalanceCents: null,
  maximumLossCents: null,
  dailyLossCents: null,
  notes: null,
  ruleSnapshot: null,
})
it.each([false, true])(
  'promotes atomically without carrying Combine profits, is idempotent and persists; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted)
    const values = {
      ...accountInput(f.member),
      stage: 'combine',
      xfaPath: 'not_applicable',
      reportedBalanceCents: 5300000,
    }
    const source = (await f.ok('POST', '/trading/accounts', create(values))).record
    await f.ok(
      'POST',
      '/trading/results',
      create({
        accountId: source.id,
        sessionAt: '2026-10-10T20:00:00Z',
        grossCents: 300000,
        feesCents: 0,
        tradeCount: null,
        notes: null,
      }),
    )
    const body = create(promotionValues(1)),
      path = `/trading/accounts/${source.id}/promote`
    expect(
      (
        await f.send(
          'PATCH',
          `/trading/accounts/${source.id}`,
          edit(1, { ...values, stage: 'xfa', xfaPath: 'standard' }),
        )
      ).statusCode,
    ).toBe(409)
    expect(
      (await f.send('POST', path, create({ ...body.values, confirmedPassed: false }))).statusCode,
    ).toBe(400)
    expect(
      (await f.send('POST', path, create({ ...body.values, sourceRevision: 99 }))).statusCode,
    ).toBe(409)
    expect(
      (await f.send('POST', path, create({ ...body.values, ruleSnapshot: { bad: true } })))
        .statusCode,
    ).toBe(400)
    expect((await f.ok('GET', '/trading')).accounts).toHaveLength(1)
    const link = (await f.ok('POST', path, body)).promotion
    expect((await f.ok('POST', path, body)).promotion.id).toBe(link.id)
    expect((await f.send('POST', path, create(body.values))).statusCode).toBe(409)
    const state = await f.ok('GET', '/trading'),
      parent = state.accounts.find((a: { id: string }) => a.id === source.id),
      child = state.accounts.find((a: { id: string }) => a.id === link.targetAccountId)
    expect(parent).toMatchObject({
      stage: 'combine',
      status: 'passed',
      reportedBalanceCents: 5300000,
      promotedToAccountId: child.id,
    })
    expect(child).toMatchObject({
      stage: 'xfa',
      status: 'active',
      xfaPath: 'standard',
      tierCents: 5000000,
      reportedBalanceCents: null,
      sourceCombineAccountId: source.id,
    })
    expect(child.ruleSnapshots).toEqual([])
    expect(
      (
        await f.send(
          'PATCH',
          `/trading/accounts/${child.id}`,
          edit(1, { ...values, stage: 'combine' }),
        )
      ).statusCode,
    ).toBe(409)

    expect(state.results).toHaveLength(1)
    expect(state.results[0]).toMatchObject({ accountId: source.id, netCents: 300000 })
    expect(state.payouts).toEqual([])
    expect(
      (await f.ok('GET', `/trading/audit/${source.id}`)).audit.map(
        (a: { action: string }) => a.action,
      ),
    ).toContain('combine_promoted')
    expect(
      (await f.send('DELETE', `/trading/accounts/${child.id}`, { revision: 1, permanent: true }))
        .statusCode,
    ).toBe(200)
    const app = await f.restart()
    expect(
      (await testRequest(app, 'GET', f.base + '/trading', f.owner.cookie)).json().accounts,
    ).toHaveLength(1)
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      db.close()
    }
  },
  20000,
)
it('enforces Owner, Viewer and household permissions for promotions', async () => {
  const f = await setup(false)
  const source = (
    await f.ok(
      'POST',
      '/trading/accounts',
      create({ ...accountInput(f.member), stage: 'combine', xfaPath: 'not_applicable' }),
    )
  ).record
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const actor = await testUser(f.app, role),
      member = f.grant(actor.id, role)
    expect(
      (
        await f.send(
          'POST',
          `/trading/accounts/${source.id}/promote`,
          create(promotionValues(1)),
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
    const own = (
      await f.ok(
        'POST',
        '/trading/accounts',
        create({ ...accountInput(member), stage: 'combine', xfaPath: 'not_applicable' }),
      )
    ).record
    expect(
      (
        await f.send(
          'POST',
          `/trading/accounts/${own.id}/promote`,
          create(promotionValues(1)),
          actor.cookie,
        )
      ).statusCode,
    ).toBe(role === 'viewer' ? 403 : 201)
  }
  const outsider = await testUser(f.app, 'Outside')
  expect(
    (
      await f.send(
        'POST',
        `/trading/accounts/${source.id}/promote`,
        create(promotionValues(1)),
        outsider.cookie,
      )
    ).statusCode,
  ).toBe(404)
}, 20000)

it('rolls back the new XFA, source status and audits if linking fails', async () => {
  const f = await setup(false)
  const source = (
    await f.ok(
      'POST',
      '/trading/accounts',
      create({ ...accountInput(f.member), stage: 'combine', xfaPath: 'not_applicable' }),
    )
  ).record
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER fictional_link_failure BEFORE INSERT ON trading_account_promotions BEGIN SELECT RAISE(ABORT,'Fictional failure'); END;",
    )
  } finally {
    db.close()
  }
  expect(
    (await f.send('POST', `/trading/accounts/${source.id}/promote`, create(promotionValues(1))))
      .statusCode,
  ).toBe(500)
  const state = await f.ok('GET', '/trading')
  expect(state.accounts).toHaveLength(1)
  expect(state.accounts[0]).toMatchObject({
    id: source.id,
    status: 'active',
    revision: 1,
    promotedToAccountId: null,
  })
  expect(
    (await f.ok('GET', `/trading/audit/${source.id}`)).audit.map(
      (a: { action: string }) => a.action,
    ),
  ).toEqual(['account_created'])
}, 20000)
