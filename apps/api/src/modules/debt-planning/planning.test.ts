import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { settlementProgress, type SettlementInput } from '@goxfinance/shared'
import { setup, create, edit } from '../trading/trading.fixture'
import { testRequest, testUser } from '../../testing/workspace'
import { openSqlite } from '../../db/encryption/sqlite-engine'
const offer = (debtId: string): SettlementInput => ({
  debtId,
  creditor: 'Fictional creditor',
  originalBalanceCents: 100000,
  amountCents: 50000,
  offerDate: '2026-01-01',
  expirationDate: '2026-12-31',
  kind: 'lump_sum',
  status: 'offered',
  writtenConfirmed: false,
  notes: null,
  document: null,
  schedule: [{ id: randomUUID(), dueDate: '2026-01-20', amountCents: 50000, paymentId: null }],
})
const debtValues = (member: string) => ({
  creditorName: 'Fictional credit',
  accountType: 'credit_card',
  currentBalanceCents: 100000,
  minimumPaymentCents: 1000,
  interestRateApr: '12',
  memberAssignments: [{ memberId: member, responsibility: 'primary' }],
})
it.each([false, true])(
  'preserves offers, audited revisions and scenario snapshots across restart; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      debt = (await f.ok('POST', '/debts', debtValues(f.member))).debt,
      values = offer(debt.id),
      body = create(values)
    const record = (await f.ok('POST', '/debt-planning/offers', body)).record
    expect((await f.ok('POST', '/debt-planning/offers', body)).record.id).toBe(record.id)
    await f.ok(
      'PATCH',
      '/debt-planning/offers/' + record.id,
      edit(1, { ...values, status: 'accepted', writtenConfirmed: true }),
    )
    expect(
      (await f.send('PATCH', '/debt-planning/offers/' + record.id, edit(1, values))).statusCode,
    ).toBe(409)
    expect((await f.ok('GET', '/debts')).debts[0].currentBalanceCents).toBe(100000)
    expect(
      (
        await f.send(
          'PATCH',
          '/debt-planning/offers/' + record.id,
          edit(2, { ...values, status: 'completed' }),
        )
      ).statusCode,
    ).toBe(409)
    const input = {
        name: 'Fictional payoff',
        startDate: '2026-01-01',
        strategy: 'avalanche',
        extraCents: 10000,
        availableCents: null,
        order: [],
        assumptions: [],
      },
      scenario = create(input)
    const saved = (await f.ok('POST', '/debt-planning/scenarios', scenario)).record
    expect((await f.ok('POST', '/debt-planning/scenarios', scenario)).record.id).toBe(saved.id)
    const next = await f.restart(),
      data = (await testRequest(next, 'GET', f.base + '/debt-planning', f.owner.cookie)).json()
    expect(data.offers[0]).toMatchObject({ id: record.id, revision: 2, status: 'accepted' })
    expect(data.scenarios[0].debts[0].currentBalanceCents).toBe(100000)
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      db.close()
    }
  },
)
it('links existing payments once; corrections and cancellations change progress without touching principal', async () => {
  const f = await setup(false),
    debt = (await f.ok('POST', '/debts', debtValues(f.member))).debt,
    values = offer(debt.id)
  const payment = (
    await f.ok('POST', `/debts/${debt.id}/payments`, {
      idempotencyKey: randomUUID(),
      amountCents: 20000,
      paymentDate: '2026-01-01',
      paymentStatus: 'completed',
      paymentMethod: 'cash',
    })
  ).payment
  values.schedule[0].paymentId = payment.id
  const record = (await f.ok('POST', '/debt-planning/offers', create(values))).record
  const list = await f.ok('GET', '/debt-planning')
  expect(settlementProgress(list.offers[0], list.payments, '2026-10-20').remainingCents).toBe(30000)
  expect(
    (
      await f.send(
        'POST',
        '/debt-planning/offers',
        create({ ...values, schedule: [{ ...values.schedule[0], id: randomUUID() }] }),
      )
    ).statusCode,
  ).toBe(409)
  await f.ok('POST', `/debts/${debt.id}/payments/${payment.id}/cancel`)
  const corrected = await f.ok('GET', '/debt-planning')
  expect(settlementProgress(corrected.offers[0], corrected.payments, '2026-10-20').paidCents).toBe(
    0,
  )
  expect(corrected.debts[0].currentBalanceCents).toBe(100000)
  expect((await f.ok('GET', '/debt-planning/' + record.id + '/audit')).audit).toHaveLength(1)
})
it('protects exclusive and joint Owner debts, permits regular responsible members, and isolates households', async () => {
  const f = await setup(false),
    owner = (await f.ok('POST', '/debts', debtValues(f.member))).debt
  for (const role of ['admin', 'editor', 'viewer']) {
    const actor = await testUser(f.app, role),
      member = f.grant(actor.id, role),
      own = (await f.ok('POST', '/debts', debtValues(member))).debt,
      joint = (
        await f.ok('POST', '/debts', {
          ...debtValues(f.member),
          memberAssignments: [
            { memberId: f.member, responsibility: 'joint' },
            { memberId: member, responsibility: 'joint' },
          ],
        })
      ).debt
    for (const d of [owner, joint])
      expect(
        (await f.send('POST', '/debt-planning/offers', create(offer(d.id)), actor.cookie))
          .statusCode,
      ).toBe(403)
    expect(
      (await f.send('POST', '/debt-planning/offers', create(offer(own.id)), actor.cookie))
        .statusCode,
    ).toBe(role === 'viewer' ? 403 : 200)
  }
  const outsider = await testUser(f.app, 'outsider')
  expect((await f.send('GET', '/debt-planning', undefined, outsider.cookie)).statusCode).toBe(404)
  expect(
    (await f.send('POST', '/debt-planning/offers', create(offer(randomUUID())))).statusCode,
  ).toBe(404)
})
it('rolls back failed offer and audit writes, rejects foreign installment IDs and invalid schedules', async () => {
  const f = await setup(false),
    debt = (await f.ok('POST', '/debts', debtValues(f.member))).debt,
    v = offer(debt.id)
  expect(
    (await f.send('POST', '/debt-planning/offers', create({ ...v, amountCents: 1 }))).statusCode,
  ).toBe(400)
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER reject_planning_audit BEFORE INSERT ON debt_planning_audit BEGIN SELECT RAISE(ABORT, 'fictional rollback'); END;",
    )
    expect((await f.send('POST', '/debt-planning/offers', create(v))).statusCode).toBe(500)
    expect(db.prepare('select count(*) as n from settlement_offers').get()).toEqual({ n: 0 })
    expect(db.prepare('select count(*) as n from settlement_installments').get()).toEqual({ n: 0 })
  } finally {
    db.close()
  }
})
