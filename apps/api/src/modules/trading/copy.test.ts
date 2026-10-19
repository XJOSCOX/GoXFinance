import { it, expect } from 'vitest'
import { tradingPerformance, type TradingAccount } from '@goxfinance/shared'
import { testRequest } from '../../testing/workspace'
import { setup, accountInput, goalInput, create, edit } from './trading.fixture'
it.each([false, true])(
  'records four-account copied events without assumed P&L and retains membership snapshots; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      accounts: TradingAccount[] = []
    for (let i = 0; i < 5; i++)
      accounts.push(
        (await f.ok('POST', '/trading/accounts', create(accountInput(f.member, 'Copy ' + i))))
          .record,
      )
    const values = {
      name: 'Fictional copy group',
      leadAccountId: accounts[0].id,
      status: 'active',
      members: accounts
        .slice(0, 4)
        .map((a, i) => ({ accountId: a.id, quantityMultiplier: String(i + 1) })),
    }
    const group = (await f.ok('POST', '/trading/groups', create(values))).record
    const event = {
      groupId: group.id,
      sessionAt: '2026-10-10T20:00:00Z',
      mode: 'trade',
      instrument: 'Example',
      direction: 'long',
      notes: null,
      entries: accounts.slice(0, 4).map((a, i) => ({
        accountId: a.id,
        quantity: String(i + 1),
        grossCents: [20000, 10000, -5000, 0][i],
        feesCents: [2000, 1000, 1500, 0][i],
      })),
    }
    const input = create(event),
      record = (await f.ok('POST', '/trading/events', input)).record
    await f.ok('POST', '/trading/events', input)
    let data = await f.ok('GET', '/trading')
    expect(data.results).toHaveLength(4)
    expect(
      tradingPerformance(
        data.results,
        accounts.map((a) => a.id),
      )[0].netCents,
    ).toBe(20500)
    await f.ok('POST', '/goals', create({ ...goalInput(f.member), copyGroupId: group.id }))
    expect((await f.ok('GET', '/goals')).goals[0].progress.actualCents).toBe(20500)
    await f.ok(
      'PATCH',
      '/trading/groups/' + group.id,
      edit(group.revision, {
        ...values,
        members: [
          ...values.members.slice(0, 3),
          { accountId: accounts[4].id, quantityMultiplier: '2' },
        ],
      }),
    )
    data = await f.ok('GET', '/trading')
    expect(
      data.events[0].membershipSnapshot.members
        .map((m: { accountId: string }) => m.accountId)
        .sort(),
    ).toEqual(
      accounts
        .slice(0, 4)
        .map((a) => a.id)
        .sort(),
    )
    expect(
      (
        await f.send(
          'POST',
          '/trading/results',
          create({
            accountId: accounts[0].id,
            sessionAt: event.sessionAt,
            grossCents: 1,
            feesCents: 0,
            tradeCount: null,
            notes: null,
          }),
        )
      ).statusCode,
    ).toBe(409)
    expect(
      (
        await f.send(
          'POST',
          '/trading/events',
          create({ ...event, mode: 'daily', entries: event.entries.slice(0, 1) }),
        )
      ).statusCode,
    ).toBe(409)
    await f.ok(
      'PATCH',
      '/trading/events/' + record.id,
      edit(record.revision, {
        ...event,
        entries: event.entries.map((e, i) => (i === 2 ? { ...e, grossCents: -8000 } : e)),
      }),
    )
    data = await f.ok('GET', '/trading')
    expect(data.results).toHaveLength(4)
    expect(
      tradingPerformance(
        data.results,
        accounts.map((a) => a.id),
      )[0].netCents,
    ).toBe(17500)
    const next = await f.restart()
    expect(
      (await testRequest(next, 'GET', f.base + '/trading', f.owner.cookie)).json().events[0]
        .membershipSnapshot.members,
    ).toHaveLength(4)
  },
  25000,
)
