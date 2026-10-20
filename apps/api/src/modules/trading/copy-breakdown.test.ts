import { expect, it } from 'vitest'
import { tradingOverviewTotals } from '@goxfinance/shared'
import { setup, accountInput, create, edit } from './trading.fixture'
import { testRequest, testUser } from '../../testing/workspace'
it.each([false, true])(
  'corrects three historical copied results with fee-adjusted breakdowns atomically; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted)
    const accounts = (
      await f.ok(
        'POST',
        '/trading/accounts/batch',
        create([0, 1, 2].map((i) => accountInput(f.member, `Fictional ${i}`))),
      )
    ).records
    const group = (
      await f.ok(
        'POST',
        '/trading/groups',
        create({
          name: 'Fictional group',
          leadAccountId: accounts[0].id,
          status: 'active',
          members: accounts.map((a: { id: string }) => ({
            accountId: a.id,
            quantityMultiplier: '1',
          })),
        }),
      )
    ).record
    const values = {
      groupId: group.id,
      sessionAt: '2026-10-10T20:00:00Z',
      mode: 'daily',
      instrument: null,
      direction: null,
      notes: null,
      entries: accounts.map((a: { id: string }) => ({
        accountId: a.id,
        quantity: '1',
        grossCents: 10000,
        feesCents: 0,
      })),
    }
    const event = (await f.ok('POST', '/trading/events', create(values))).record
    const before = (await f.ok('GET', '/trading')).results
    expect(before.every((r: { profitCents: number | null }) => r.profitCents === null)).toBe(true)
    const corrected = {
      ...values,
      entries: values.entries.map((e: (typeof values.entries)[number]) => ({
        ...e,
        profitCents: 15000,
        lossCents: 5000,
        feesIncluded: true,
      })),
    }
    const outsider = await testUser(f.app, 'Outside')
    expect(
      (await f.send('PATCH', `/trading/events/${event.id}`, edit(1, corrected), outsider.cookie))
        .statusCode,
    ).toBe(404)
    for (const role of ['admin', 'editor', 'viewer'] as const) {
      const actor = await testUser(f.app, role)
      f.grant(actor.id, role)
      expect(
        (await f.send('PATCH', `/trading/events/${event.id}`, edit(1, corrected), actor.cookie))
          .statusCode,
      ).toBe(403)
    }
    const bad = {
      ...corrected,
      entries: corrected.entries.map((e: (typeof corrected.entries)[number], i: number) =>
        i === 2 ? { ...e, feesCents: 100 } : e,
      ),
    }
    expect((await f.send('PATCH', `/trading/events/${event.id}`, edit(1, bad))).statusCode).toBe(
      400,
    )
    expect((await f.ok('GET', '/trading')).events[0].revision).toBe(1)
    await f.ok('PATCH', `/trading/events/${event.id}`, edit(1, corrected))
    expect(
      (await f.send('PATCH', `/trading/events/${event.id}`, edit(1, corrected))).statusCode,
    ).toBe(409)
    const after = (await f.ok('GET', '/trading')).results
    expect(after.map((r: { id: string }) => r.id).sort()).toEqual(
      before.map((r: { id: string }) => r.id).sort(),
    )
    expect(tradingOverviewTotals(after, '2026-10')).toMatchObject({
      profitCents: 45000,
      lossCents: 15000,
      feesCents: 0,
      netCents: 30000,
      missingBreakdownCount: 0,
    })
    expect(
      (await f.ok('GET', `/trading/audit/${event.id}`)).audit.map(
        (a: { action: string }) => a.action,
      ),
    ).toContain('event_corrected')
    const app = await f.restart()
    const persisted = (await testRequest(app, 'GET', f.base + '/trading', f.owner.cookie)).json()
    expect(persisted.results).toHaveLength(3)
    expect(persisted.results.every((r: { feesIncluded: boolean }) => r.feesIncluded)).toBe(true)
    expect(persisted.payouts).toEqual([])
  },
  20000,
)
