import { randomUUID } from 'node:crypto'
import { it, expect } from 'vitest'
import { setup, goalInput, accountInput, create, edit } from '../trading/trading.fixture'
import { testRequest, testUser } from '../../testing/workspace'
import { openSqlite } from '../../db/encryption/sqlite-engine'
it.each([false, true])(
  'saves independent account goals atomically with retries, corrections and restart; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted)
    const accounts = (
      await f.ok(
        'POST',
        '/trading/accounts/batch',
        create(
          [1, 2, 3].map((i) => ({
            ...accountInput(f.member, `Combine ${i}`),
            stage: 'combine',
            xfaPath: 'not_applicable',
          })),
        ),
      )
    ).records as { id: string }[]
    const input = create({
      template: { ...goalInput(f.member), name: 'Pass Combine', targetCents: 300000 },
      accounts: accounts.map((a) => ({ accountId: a.id })),
    })
    const records = (await f.ok('POST', '/goals/batch', input)).records as {
      id: string
      revision: number
      tradingAccountId: string
    }[]
    expect(records).toHaveLength(3)
    expect(
      (await f.ok('POST', '/goals/batch', input)).records.map((r: { id: string }) => r.id),
    ).toEqual(records.map((r) => r.id))
    expect(
      (
        await f.send('POST', '/goals/batch', {
          ...input,
          values: { ...input.values, template: { ...input.values.template, targetCents: 1 } },
        })
      ).statusCode,
    ).toBe(409)
    await f.ok(
      'POST',
      '/trading/results/batch',
      create(
        accounts.map((a, i) => ({
          accountId: a.id,
          reportedDate: '2026-10-09',
          sessionAt: '2026-10-15T18:00:00Z',
          grossCents: [300000, -10000, 10000][i],
          feesCents: 0,
          feesIncluded: true,
          profitCents: null,
          lossCents: null,
          tradeCount: null,
          notes: null,
        })),
      ),
    )
    const before = (await f.ok('GET', '/goals')).goals
    expect(before.map((g: { targetCents: number }) => g.targetCents)).toEqual([
      300000, 300000, 300000,
    ])
    expect(before.filter((g: { progress: { met: boolean } }) => g.progress.met)).toHaveLength(1)
    const correction = edit(1, {
      template: { ...input.values.template, targetCents: 350000 },
      accounts: records.map((g) => ({
        accountId: g.tradingAccountId,
        goalId: g.id,
        revision: g.revision,
      })),
    })
    await f.ok('POST', '/goals/batch', correction)
    expect((await f.send('POST', '/goals/batch', correction)).statusCode).toBe(409)
    const next = await f.restart()
    const after = (await testRequest(next, 'GET', f.base + '/goals', f.owner.cookie)).json().goals
    expect(after).toHaveLength(3)
    expect(
      after.every(
        (g: { targetCents: number; revision: number }) =>
          g.targetCents === 350000 && g.revision === 2,
      ),
    ).toBe(true)
    const audit = (
      await testRequest(next, 'GET', f.base + '/goals/' + records[0].id + '/audit', f.owner.cookie)
    ).json().audit
    expect(audit.map((a: { action: string }) => a.action)).toEqual([
      'goal_created',
      'goal_corrected',
    ])
  },
  20000,
)
it('rejects invalid selections and rolls back all edits when one revision is stale', async () => {
  const f = await setup(false)
  const accounts = (
    await f.ok(
      'POST',
      '/trading/accounts/batch',
      create([accountInput(f.member, 'First'), accountInput(f.member, 'Second')]),
    )
  ).records as { id: string }[]
  const input = create({
    template: goalInput(f.member),
    accounts: accounts.map((a) => ({ accountId: a.id })),
  })
  const goals = (await f.ok('POST', '/goals/batch', input)).records as {
    id: string
    tradingAccountId: string
    revision: number
  }[]
  await f.ok(
    'PATCH',
    '/goals/' + goals[1].id,
    edit(1, { ...input.values.template, tradingAccountId: accounts[1].id }),
  )
  expect(
    (
      await f.send(
        'POST',
        '/goals/batch',
        edit(1, {
          template: { ...input.values.template, targetCents: 1 },
          accounts: goals.map((g) => ({
            accountId: g.tradingAccountId,
            goalId: g.id,
            revision: 1,
          })),
        }),
      )
    ).statusCode,
  ).toBe(409)
  expect(
    (await f.ok('GET', '/goals')).goals.find((g: { id: string }) => g.id === goals[0].id).revision,
  ).toBe(1)
  for (const selected of [
    [],
    [accounts[0], accounts[0]].map((a) => ({ accountId: a.id })),
    [{ accountId: randomUUID() }],
  ])
    expect(
      (await f.send('POST', '/goals/batch', create({ ...input.values, accounts: selected })))
        .statusCode,
    ).toBe(400)
})
it('protects Owner goals and household isolation for every account in a batch', async () => {
  const f = await setup(false)
  const owned = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record
  const ownerGoal = (
    await f.ok('POST', '/goals', create({ ...goalInput(f.member), tradingAccountId: owned.id }))
  ).record
  for (const role of ['admin', 'editor', 'viewer']) {
    const actor = await testUser(f.app, role),
      member = f.grant(actor.id, role)
    const own = (await f.ok('POST', '/trading/accounts', create(accountInput(member, role)))).record
    const values = {
      template: goalInput(member),
      accounts: [{ accountId: own.id }, { accountId: owned.id }],
    }
    expect(
      (
        await f.send(
          'POST',
          '/goals/batch',
          create({ ...values, template: goalInput(f.member) }),
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await f.send(
          'POST',
          '/goals/batch',
          edit(1, {
            template: goalInput(member),
            accounts: [{ accountId: owned.id, goalId: ownerGoal.id, revision: 1 }],
          }),
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
    if (role !== 'viewer')
      expect(
        (
          await f.ok(
            'POST',
            '/goals/batch',
            create({ ...values, accounts: [{ accountId: own.id }] }),
            actor.cookie,
          )
        ).records,
      ).toHaveLength(1)
  }
  const outsider = await testUser(f.app, 'Outside')
  expect(
    (
      await f.send(
        'POST',
        '/goals/batch',
        create({ template: goalInput(f.member), accounts: [{ accountId: owned.id }] }),
        outsider.cookie,
      )
    ).statusCode,
  ).toBe(404)
  expect(
    (await f.ok('GET', '/goals')).goals.find((g: { id: string }) => g.id === ownerGoal.id).revision,
  ).toBe(1)
})
it('rolls back generated goals and audit entries when SQLite rejects a later insert', async () => {
  const f = await setup(false)
  const accounts = (
    await f.ok(
      'POST',
      '/trading/accounts/batch',
      create([accountInput(f.member, 'First'), accountInput(f.member, 'Second')]),
    )
  ).records as { id: string }[]
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER reject_second_goal BEFORE INSERT ON financial_goals WHEN NEW.name LIKE '%Second' BEGIN SELECT RAISE(ABORT,'Fictional test rejection'); END",
    )
    expect(
      (
        await f.send(
          'POST',
          '/goals/batch',
          create({
            template: goalInput(f.member),
            accounts: accounts.map((a) => ({ accountId: a.id })),
          }),
        )
      ).statusCode,
    ).toBeGreaterThanOrEqual(400)
    expect((await f.ok('GET', '/goals')).goals).toEqual([])
    expect(
      (db.prepare('SELECT count(*) as count FROM goal_audit').get() as { count: number }).count,
    ).toBe(0)
  } finally {
    db.close()
  }
})
