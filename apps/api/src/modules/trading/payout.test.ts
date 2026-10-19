import { it, expect } from 'vitest'
import { incomeTransactionSchema, type TradingAccount } from '@goxfinance/shared'
import { testRequest } from '../../testing/workspace'
import { setup, accountInput, payoutInput, create, edit } from './trading.fixture'
it.each([false, true])(
  'keeps batch payout statuses independent and synchronizes each deposited income once; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      accounts: TradingAccount[] = []
    for (let i = 0; i < 4; i++)
      accounts.push(
        (await f.ok('POST', '/trading/accounts', create(accountInput(f.member, 'Payout ' + i))))
          .record,
      )
    const batch = create({
      name: 'Fictional batch',
      requestDate: '2026-10-10',
      notes: null,
      entries: accounts.map((a, i) => ({
        accountId: a.id,
        requestedCents: [100000, 200000, 150000, 50000][i],
      })),
    })
    await f.ok('POST', '/trading/batches', batch)
    await f.ok('POST', '/trading/batches', batch)
    const data = await f.ok('GET', '/trading')
    expect(data.batches).toHaveLength(1)
    expect(data.payouts).toHaveLength(4)
    expect((await f.ok('GET', '/income')).transactions).toHaveLength(0)
    const first = data.payouts.find((p: { accountId: string }) => p.accountId === accounts[0].id),
      second = data.payouts.find((p: { accountId: string }) => p.accountId === accounts[1].id),
      third = data.payouts.find((p: { accountId: string }) => p.accountId === accounts[2].id)
    const paid = {
      ...payoutInput(accounts[0].id),
      status: 'paid',
      receivedCents: 90000,
      depositDate: '2026-10-11',
      receiptConfirmed: true,
    }
    const saved = (await f.ok('PATCH', '/trading/payouts/' + first.id, edit(first.revision, paid)))
      .record
    await f.ok(
      'PATCH',
      '/trading/payouts/' + second.id,
      edit(second.revision, {
        ...payoutInput(accounts[1].id),
        requestedCents: 200000,
        status: 'approved',
        approvedCents: 150000,
      }),
    )
    await f.ok(
      'PATCH',
      '/trading/payouts/' + third.id,
      edit(third.revision, {
        ...payoutInput(accounts[2].id),
        requestedCents: 150000,
        status: 'rejected',
      }),
    )
    let deposits = (await f.ok('GET', '/income')).transactions
    expect(deposits).toHaveLength(1)
    expect(deposits[0].actualNetCents).toBe(90000)
    const tx = deposits[0],
      values = incomeTransactionSchema.parse(
        Object.fromEntries(Object.keys(incomeTransactionSchema.shape).map((key) => [key, tx[key]])),
      )
    expect(
      (await f.send('PATCH', '/income/transactions/' + tx.id, edit(tx.revision, values)))
        .statusCode,
    ).toBe(409)
    const corrected = (
      await f.ok(
        'PATCH',
        '/trading/payouts/' + first.id,
        edit(saved.revision, { ...paid, receivedCents: 95000 }),
      )
    ).record
    deposits = (await f.ok('GET', '/income')).transactions
    expect(deposits).toHaveLength(1)
    expect(deposits[0].actualNetCents).toBe(95000)
    await f.ok(
      'PATCH',
      '/trading/payouts/' + first.id,
      edit(corrected.revision, { ...payoutInput(accounts[0].id), status: 'cancelled' }),
    )
    deposits = (await f.ok('GET', '/income')).transactions
    expect(deposits[0].status).toBe('cancelled')
    expect((await f.ok('GET', '/overview?month=2026-10')).income.confirmedCents).toBe(0)
    const next = await f.restart(),
      persisted = (await testRequest(next, 'GET', f.base + '/trading', f.owner.cookie)).json()
    expect(persisted.payouts.map((p: { status: string }) => p.status).sort()).toEqual([
      'approved',
      'cancelled',
      'rejected',
      'requested',
    ])
  },
  25000,
)

it('links an existing confirmed receipt without creating another deposit and rejects duplicate requests', async () => {
  const f = await setup(false),
    account = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record
  const source = (
    await f.ok(
      'POST',
      '/income/sources',
      create({
        responsibleMemberId: f.member,
        name: 'Existing payout income',
        incomeType: 'trading_payout',
        frequency: 'irregular',
        hourlyRateCents: null,
        expectedGrossCents: null,
        expectedNetCents: null,
        payday: null,
        overtimeMultiplier: '1',
        status: 'active',
        notes: null,
      }),
    )
  ).source
  const tx = (
    await f.ok(
      'POST',
      '/income/transactions',
      create({
        sourceId: source.id,
        workPeriodStart: null,
        workPeriodEnd: null,
        regularHours: null,
        overtimeHours: null,
        hourlyRateCents: null,
        overtimeMultiplier: '1',
        expectedGrossCents: null,
        expectedNetCents: null,
        actualGrossCents: null,
        deductionsCents: null,
        actualNetCents: 90000,
        payDate: '2026-10-11',
        depositDate: '2026-10-11',
        status: 'confirmed',
        reference: 'Existing fictional deposit',
        notes: null,
        receiptConfirmed: true,
        tradingPayoutWithdrawn: true,
      }),
    )
  ).transaction
  const values = {
    ...payoutInput(account.id),
    status: 'paid',
    receivedCents: 90000,
    depositDate: '2026-10-11',
    receiptConfirmed: true,
    existingIncomeTransactionId: tx.id,
  }
  await f.ok('POST', '/trading/payouts', create(values))
  expect((await f.ok('GET', '/income')).transactions).toHaveLength(1)
  expect((await f.send('POST', '/trading/payouts', create(values))).statusCode).toBe(409)
  expect(
    (
      await f.send(
        'POST',
        '/trading/payouts',
        create({ ...values, requestDate: '2026-10-09', reference: 'Second payout' }),
      )
    ).statusCode,
  ).toBe(409)
})

it('rolls back the parent batch and prior children if a later account request fails', async () => {
  const f = await setup(false),
    first = (await f.ok('POST', '/trading/accounts', create(accountInput(f.member)))).record,
    second = (
      await f.ok('POST', '/trading/accounts', create(accountInput(f.member, 'Second account')))
    ).record
  await f.ok('POST', '/trading/payouts', create(payoutInput(second.id)))
  const result = await f.send(
    'POST',
    '/trading/batches',
    create({
      name: 'Must roll back',
      requestDate: '2026-10-10',
      notes: null,
      entries: [
        { accountId: first.id, requestedCents: 100000 },
        { accountId: second.id, requestedCents: 100000 },
      ],
    }),
  )
  expect(result.statusCode).toBe(409)
  const data = await f.ok('GET', '/trading')
  expect(data.batches).toHaveLength(0)
  expect(data.payouts).toHaveLength(1)
})
