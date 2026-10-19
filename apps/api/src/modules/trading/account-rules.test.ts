import { it, expect } from 'vitest'
import { testRequest, testUser } from '../../testing/workspace'
import { setup, accountInput, create, payoutInput } from './trading.fixture'

const rule = {
  version: 2,
  label: 'Example editable plan',
  effectiveDate: '2026-10-01',
  minimumDays: 5,
  minimumWinningDayCents: 15000,
  minimumNetCents: null,
  maximumPayoutCents: 400000,
  profitShareBps: 9000,
  notes: 'Fictional test configuration',
  monthlyFeeCents: 8500,
  activationFeeCents: 0,
}
it.each([false, true])(
  'appends rules atomically without changing balances, paths or deposits; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted)
    const accounts = (
      await f.ok(
        'POST',
        '/trading/accounts/batch',
        create([accountInput(f.member, 'First'), accountInput(f.member, 'Second')]),
      )
    ).records
    const input = create(
      accounts.map((a: { id: string; revision: number }) => ({
        accountId: a.id,
        revision: a.revision,
        reason: 'Review plan settings',
        tierCents: 5000000,
        maximumLossCents: 200000,
        dailyLossCents: 100000,
        ruleSnapshot: rule,
      })),
    )
    const first = (await f.ok('POST', '/trading/accounts/rules', input)).records
    await f.ok('POST', '/trading/accounts/rules', input)
    expect(
      first.every(
        (a: { ruleSnapshots: unknown[]; reportedBalanceCents: null; xfaPath: string }) =>
          a.ruleSnapshots.length === 1 &&
          a.reportedBalanceCents === null &&
          a.xfaPath === 'standard',
      ),
    ).toBe(true)
    const stale = create(
      input.values.map((v: object) => ({ ...v, ruleSnapshot: { ...rule, profitShareBps: 8000 } })),
    )
    expect((await f.send('POST', '/trading/accounts/rules', stale)).statusCode).toBe(409)
    const p = (await f.ok('POST', '/trading/payouts', create(payoutInput(first[0].id)))).record
    expect(p.incomeTransactionId).toBeNull()
    expect(p.receivedCents).toBeNull()
    const next = await f.restart()
    const data = (await testRequest(next, 'GET', f.base + '/trading', f.owner.cookie)).json()
    expect(data.accounts[0].ruleSnapshots[0]).toMatchObject(rule)
    expect(data.results).toEqual([])
    expect(data.payouts[0].status).toBe('requested')
  },
  20000,
)
it('rejects unauthorized and cross-household rule updates without partial writes', async () => {
  const f = await setup(false),
    a = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record
  const input = create([
    {
      accountId: a.id,
      revision: a.revision,
      reason: 'Review rules',
      tierCents: null,
      maximumLossCents: null,
      dailyLossCents: null,
      ruleSnapshot: rule,
    },
  ])
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const actor = await testUser(f.app, role)
    f.grant(actor.id, role)
    expect((await f.send('POST', '/trading/accounts/rules', input, actor.cookie)).statusCode).toBe(
      403,
    )
  }
  const outsider = await testUser(f.app, 'Outsider')
  expect((await f.send('POST', '/trading/accounts/rules', input, outsider.cookie)).statusCode).toBe(
    404,
  )
  expect((await f.ok('GET', '/trading')).accounts[0].ruleSnapshots).toEqual([])
}, 20000)
