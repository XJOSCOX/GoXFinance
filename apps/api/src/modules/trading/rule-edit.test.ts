import { it, expect } from 'vitest'
import { testRequest, testUser } from '../../testing/workspace'
import { setup, accountInput, create, edit } from './trading.fixture'
import { ruleForPayout } from '@goxfinance/shared'

const rule = {
  label: 'Example',
  effectiveDate: '2026-01-01',
  minimumDays: 5,
  minimumNetCents: null,
  minimumWinningDayCents: 15000,
  maximumPayoutCents: 400000,
  profitShareBps: 9000,
  notes: null,
}
it.each([false, true])(
  'edits a saved rule with atomic version history, stale protection and restart persistence; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted)
    const a = (
      await f.ok(
        'POST',
        '/trading/accounts',
        create({ ...accountInput(f.member), ruleSnapshot: rule }),
      )
    ).record
    const id = a.ruleSnapshots[0].id,
      path = '/trading/accounts/' + a.id + '/rules/' + id
    const edited = (
      await f.ok(
        'PATCH',
        path,
        edit(a.revision, {
          ...rule,
          minimumDays: 4,
          profitShareBps: 8000,
          progressStartDate: '2026-10-01',
        }),
      )
    ).record
    expect(edited.ruleSnapshots).toHaveLength(2)
    expect(edited.ruleSnapshots[0]).toMatchObject(rule)
    expect(edited.ruleSnapshots[1]).toMatchObject({
      minimumDays: 4,
      profitShareBps: 8000,
      supersedesRuleId: id,
    })
    expect((await f.send('PATCH', path, edit(a.revision, rule))).statusCode).toBe(409)
    expect((await f.send('PATCH', path, edit(edited.revision, rule))).statusCode).toBe(409)
    expect((await f.ok('GET', '/trading/audit/' + id)).audit[0].action).toBe('rule_corrected')
    const next = await f.restart(),
      data = (await testRequest(next, 'GET', f.base + '/trading', f.owner.cookie)).json()
    expect(ruleForPayout(data.accounts[0].ruleSnapshots, '2026-10-19')?.minimumDays).toBe(4)
    expect(data.results).toEqual([])
    expect(data.payouts).toEqual([])
  },
  20000,
)
it('enforces Owner protection, read-only and household scope for direct rule edits', async () => {
  const f = await setup(false)
  const a = (
    await f.ok(
      'POST',
      '/trading/accounts',
      create({ ...accountInput(f.member), ruleSnapshot: rule }),
    )
  ).record
  const path = '/trading/accounts/' + a.id + '/rules/' + a.ruleSnapshots[0].id
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const actor = await testUser(f.app, role),
      member = f.grant(actor.id, role)
    expect((await f.send('PATCH', path, edit(a.revision, rule), actor.cookie)).statusCode).toBe(403)
    const own = (
      await f.ok(
        'POST',
        '/trading/accounts',
        create({ ...accountInput(member, role), ruleSnapshot: rule }),
      )
    ).record
    expect(
      (
        await f.send(
          'PATCH',
          '/trading/accounts/' + own.id + '/rules/' + own.ruleSnapshots[0].id,
          edit(own.revision, rule),
          actor.cookie,
        )
      ).statusCode,
    ).toBe(role === 'viewer' ? 403 : 200)
    expect(
      (
        await f.send(
          'PATCH',
          '/trading/accounts/' + own.id + '/rules/' + a.ruleSnapshots[0].id,
          edit(own.revision, rule),
        )
      ).statusCode,
    ).toBe(404)
  }
  const outsider = await testUser(f.app, 'Outsider')
  expect((await f.send('PATCH', path, edit(a.revision, rule), outsider.cookie)).statusCode).toBe(
    404,
  )
}, 20000)
