import { it, expect } from 'vitest'
import { setup, goalInput, accountInput, create, edit } from '../trading/trading.fixture'
import { testRequest, testUser } from '../../testing/workspace'
it.each([false, true])(
  'persists manual contributions and corrections without inferring assets; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      input = create({ ...goalInput(f.member), goalType: 'savings' }),
      goal = (await f.ok('POST', '/goals', input)).record
    await f.ok('POST', '/goals', input)
    const contribution = create({
      goalId: goal.id,
      amountCents: 20000,
      date: '2026-10-10',
      notes: 'Fictional explicit contribution',
    })
    const row = (await f.ok('POST', '/goals/contributions', contribution)).record
    await f.ok('POST', '/goals/contributions', contribution)
    expect((await f.ok('GET', '/goals')).goals[0].progress.actualCents).toBe(20000)
    await f.ok(
      'PATCH',
      '/goals/contributions/' + row.id,
      edit(row.revision, { ...contribution.values, amountCents: 15000 }),
    )
    expect(
      (
        await f.send(
          'PATCH',
          '/goals/contributions/' + row.id,
          edit(row.revision, contribution.values),
        )
      ).statusCode,
    ).toBe(409)
    expect(
      (
        await f.send(
          'PATCH',
          '/goals/' + goal.id,
          edit(goal.revision, { ...input.values, goalType: 'manual' }),
        )
      ).statusCode,
    ).toBe(409)
    const next = await f.restart(),
      data = (await testRequest(next, 'GET', f.base + '/goals', f.owner.cookie)).json()
    expect(data.contributions).toHaveLength(1)
    expect(data.goals[0].progress.actualCents).toBe(15000)
    expect(data.goals[0].progress.shortfallCents).toBe(15000)
  },
  15000,
)
it('denies Owner goal corrections and cross-household links to nonowners', async () => {
  const f = await setup(false),
    goal = (await f.ok('POST', '/goals', create(goalInput(f.member)))).record,
    admin = await testUser(f.app, 'Admin'),
    member = f.grant(admin.id, 'admin')
  expect(
    (
      await f.send(
        'PATCH',
        '/goals/' + goal.id,
        edit(goal.revision, goalInput(f.member)),
        admin.cookie,
      )
    ).statusCode,
  ).toBe(403)
  const other = await testUser(f.app, 'Other')
  expect((await f.send('GET', '/goals', undefined, other.cookie)).statusCode).toBe(404)
  const account = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record
  expect(
    (
      await f.send(
        'POST',
        '/goals',
        create({ ...goalInput(member), tradingAccountId: account.id }),
        admin.cookie,
      )
    ).statusCode,
  ).toBe(400)
})
