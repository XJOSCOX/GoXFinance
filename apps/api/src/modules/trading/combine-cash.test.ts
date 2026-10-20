import { expect, it } from 'vitest'
import { setup, accountInput, payoutInput, create } from './trading.fixture'
it('keeps Combine P&L out of household cash and rejects payout and Income creation', async () => {
  const f = await setup(false)
  const before = await f.ok('GET', '/overview?month=2026-10')
  const a = (
    await f.ok(
      'POST',
      '/trading/accounts',
      create({ ...accountInput(f.member), stage: 'combine', xfaPath: 'not_applicable' }),
    )
  ).record
  await f.ok(
    'POST',
    '/trading/results',
    create({
      accountId: a.id,
      sessionAt: '2026-10-10T20:00:00Z',
      grossCents: 123456,
      feesCents: 0,
      tradeCount: 3,
      notes: null,
    }),
  )
  for (const status of ['requested', 'approved', 'paid'] as const) {
    const response = await f.send(
      'POST',
      '/trading/payouts',
      create({
        ...payoutInput(a.id),
        status,
        ...(status === 'paid'
          ? { receivedCents: 10000, depositDate: '2026-10-10', receiptConfirmed: true }
          : {}),
      }),
    )
    expect(response.statusCode).toBe(409)
  }
  const after = await f.ok('GET', '/overview?month=2026-10')
  expect(after.income).toEqual(before.income)
  expect(after.actual).toEqual(before.actual)
  expect((await f.ok('GET', '/trading')).payouts).toEqual([])
})
it('rolls back a mixed funded/Combine payout batch instead of creating partial cash activity', async () => {
  const f = await setup(false)
  const accounts = (
    await f.ok(
      'POST',
      '/trading/accounts/batch',
      create([
        accountInput(f.member, 'Funded'),
        { ...accountInput(f.member, 'Evaluation'), stage: 'combine', xfaPath: 'not_applicable' },
      ]),
    )
  ).records
  expect(
    (
      await f.send(
        'POST',
        '/trading/batches',
        create({
          name: 'Fictional batch',
          requestDate: '2026-10-10',
          notes: null,
          entries: accounts.map((a: { id: string }) => ({
            accountId: a.id,
            requestedCents: 10000,
          })),
        }),
      )
    ).statusCode,
  ).toBe(409)
  const data = await f.ok('GET', '/trading')
  expect(data.payouts).toEqual([])
  expect(data.batches).toEqual([])
})
