import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import type { BillInput, BillView } from '@goxfinance/shared'
import { buildApp } from '../../app'
import { testHome, testOrigin, testRequest, testRole, testUser } from '../../testing/workspace'

const apps: FastifyInstance[] = [],
  folders: string[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})
async function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'gox-bills-'))
  folders.push(folder)
  const path = join(folder, 'test.sqlite'),
    app = await buildApp({ databasePath: path, frontendOrigin: testOrigin, secureCookie: false })
  apps.push(app)
  const owner = await testUser(app, 'Owner'),
    { home, member } = await testHome(app, owner.cookie),
    base = `/api/households/${home}/bills`
  const request = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    suffix: string,
    payload?: object,
    cookie = owner.cookie,
  ) => testRequest(app, method, base + suffix, cookie, payload)
  const input: BillInput = {
    name: 'Example utility',
    category: 'Utilities',
    kind: 'recurring',
    amountType: 'variable',
    amountCents: null,
    estimatedAmountCents: 30000,
    frequency: 'monthly',
    nextDueDate: '2026-08-31',
    endDate: null,
    autoPay: true,
    status: 'active',
    notes: null,
    linkedDebtId: null,
    memberIds: [member],
  }
  async function create(changes: Partial<BillInput> = {}) {
    const result = await request('POST', '', { ...input, ...changes })
    expect(result.statusCode, result.body).toBe(201)
    return result.json().bill as BillView
  }
  async function pending(bill: BillView, amount = 20000) {
    const result = await request('POST', `/${bill.id}/periods/${bill.periods[0].id}/payments`, {
      idempotencyKey: randomUUID(),
      amountCents: amount,
      paymentDate: '2026-10-01',
      method: 'bank_transfer',
      notes: null,
    })
    expect(result.statusCode, result.body).toBe(200)
    return result.json().bill as BillView
  }
  const act = (bill: BillView, body: object, cookie = owner.cookie) =>
    request('POST', `/${bill.id}/actions`, body, cookie)
  return { app, path, owner, home, member, base, request, input, create, pending, act }
}
describe('bills persistence, payments and permissions', () => {
  it('stops a recurring schedule without hiding or preventing payment of existing obligations', async () => {
    const f = await setup(),
      bill = await f.create({ amountType: 'fixed', amountCents: 10000, estimatedAmountCents: null })
    await f.act(bill, { action: 'archive_bill' })
    await f.request('POST', '/refresh')
    const read = (await f.request('GET', `/${bill.id}`)).json().bill as BillView
    expect(read.periods).toHaveLength(bill.periods.length)
    expect(read.status).toBe('inactive')
    const overview = (
      await testRequest(
        f.app,
        'GET',
        `/api/households/${f.home}/overview?month=2026-10`,
        f.owner.cookie,
      )
    ).json()
    expect(overview.bills.standaloneMonthlyCents).toBe(0)
    expect(overview.bills.outstandingCents).toBe(bill.periods.length * 10000)
    const pending = await f.pending(read, 10000)
    expect(
      (await f.act(read, { action: 'confirm_payment', paymentId: pending.payments[0].id }))
        .statusCode,
    ).toBe(200)
  })
  it('preserves variable period history and requires payment confirmation', async () => {
    const f = await setup(),
      bill = await f.create(),
      periodId = bill.periods[0].id
    expect(bill.periods[0].amountCents).toBeNull()
    expect(bill.periods[0].remainingCents).toBeNull()
    const actual = await f.act(bill, {
      action: 'edit_period',
      periodId,
      changes: { amountCents: 34218, creditCents: 0, notes: 'Statement' },
    })
    expect(actual.statusCode).toBe(200)
    const pending = await f.pending(bill),
      paymentId = pending.payments[0].id
    expect(pending.periods[0].paidCents).toBe(0)
    const confirmed = await f.act(bill, { action: 'confirm_payment', paymentId })
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    expect(confirmed.json().bill.periods[0]).toMatchObject({
      paidCents: 20000,
      remainingCents: 14218,
      paymentStatus: 'partially_paid',
    })
    expect((await f.act(bill, { action: 'confirm_payment', paymentId })).statusCode).toBe(409)
    expect(
      (
        await f.act(bill, {
          action: 'edit_bill',
          changes: { ...f.input, estimatedAmountCents: 40000 },
        })
      ).statusCode,
    ).toBe(200)
    const saved = (await f.request('GET', `/${bill.id}`)).json().bill as BillView
    expect(saved.periods[0]).toMatchObject({
      amountCents: 34218,
      estimatedAmountCents: 30000,
      paidCents: 20000,
    })
    const secondPeriod = saved.periods[1]
    await f.act(bill, {
      action: 'edit_period',
      periodId: secondPeriod.id,
      changes: { amountCents: 28100, creditCents: 0, notes: null },
    })
    expect((await f.request('GET', `/${bill.id}`)).json().bill.periods[0].amountCents).toBe(34218)
    await f.app.close()
    apps.splice(apps.indexOf(f.app), 1)
    const reopened = await buildApp({
      databasePath: f.path,
      frontendOrigin: testOrigin,
      secureCookie: false,
    })
    apps.push(reopened)
    const result = await testRequest(reopened, 'GET', `${f.base}/${bill.id}`, f.owner.cookie)
    expect(result.statusCode).toBe(200)
    expect(result.json().bill.periods[0].paidCents).toBe(20000)
    expect(result.json().audit.length).toBeGreaterThan(4)
  })
  it('keeps one-time bills single, supports corrections, credits and cancellation', async () => {
    const f = await setup(),
      bill = await f.create({
        kind: 'one_time',
        frequency: null,
        amountType: 'fixed',
        amountCents: 10000,
        estimatedAmountCents: null,
      })
    await f.request('POST', '/refresh')
    await f.request('POST', '/refresh')
    expect((await f.request('GET', `/${bill.id}`)).json().bill.periods).toHaveLength(1)
    await f.act(bill, {
      action: 'edit_bill',
      changes: {
        ...f.input,
        kind: 'one_time',
        frequency: null,
        amountType: 'fixed',
        amountCents: 10000,
        estimatedAmountCents: null,
        nextDueDate: '2026-09-01',
      },
    })
    expect((await f.request('GET', `/${bill.id}`)).json().bill.periods).toHaveLength(1)
    const pending = await f.pending(bill, 11000),
      paymentId = pending.payments[0].id
    const paid = await f.act(bill, { action: 'confirm_payment', paymentId })
    expect(paid.json().bill.periods[0]).toMatchObject({
      paymentStatus: 'overpaid',
      overpaidCents: 1000,
    })
    const edited = await f.act(bill, {
      action: 'edit_payment',
      paymentId,
      changes: {
        amountCents: 8000,
        paymentDate: '2026-10-02',
        method: 'cash',
        notes: 'Correction',
      },
    })
    expect(edited.json().bill.periods[0].remainingCents).toBe(2000)
    const credited = await f.act(bill, {
      action: 'edit_period',
      periodId: bill.periods[0].id,
      changes: { amountCents: 10000, creditCents: 2000, notes: 'Credit received' },
    })
    expect(credited.json().bill.periods[0].paymentStatus).toBe('credited')
    await f.act(bill, { action: 'cancel_payment', paymentId })
    expect((await f.request('GET', `/${bill.id}`)).json().bill.periods[0].remainingCents).toBe(8000)
    expect(
      (await f.act(bill, { action: 'archive_bill' })).json().bill.periods[0].paymentStatus,
    ).toBe('cancelled')
  })
  it('rejects invalid inputs, duplicate submissions and cross-household records', async () => {
    const f = await setup(),
      bill = await f.create(),
      other = await testUser(f.app, 'Other')
    expect((await f.request('POST', '', f.input)).statusCode).toBe(409)
    expect((await f.request('POST', '', { ...f.input, amountCents: 1 })).statusCode).toBe(400)
    expect((await f.request('GET', `/${bill.id}`, undefined, other.cookie)).statusCode).toBe(404)
    const key = randomUUID(),
      input = {
        idempotencyKey: key,
        amountCents: 1000,
        paymentDate: '2026-10-01',
        method: 'cash',
        notes: null,
      },
      url = `/${bill.id}/periods/${bill.periods[0].id}/payments`
    expect((await f.request('POST', url, input)).statusCode).toBe(200)
    expect((await f.request('POST', url, input)).json().bill.payments).toHaveLength(1)
    expect((await f.request('POST', url, { ...input, amountCents: 2000 })).statusCode).toBe(409)
    expect(
      (await f.request('POST', `/${bill.id}/periods/${randomUUID()}/payments`, input)).statusCode,
    ).toBe(404)
  })
  it.each(['admin', 'editor'] as const)(
    'requires Owner approval for %s joint changes and blocks exclusive Owner edits',
    async (role) => {
      const f = await setup(),
        actor = await testUser(f.app, role),
        actorMember = testRole(f.path, f.home, actor.id, role)
      const exclusive = await f.create(),
        joint = await f.create({ name: 'Joint bill', memberIds: [f.member, actorMember] })
      expect((await f.act(exclusive, { action: 'archive_bill' }, actor.cookie)).statusCode).toBe(
        403,
      )
      expect((await f.act(joint, { action: 'archive_bill' }, actor.cookie)).statusCode).toBe(403)
      const proposal = {
        action: 'edit_period',
        periodId: joint.periods[0].id,
        changes: { amountCents: 25000, creditCents: 0, notes: null },
      }
      const result = await f.request(
        'POST',
        `/${joint.id}/requests`,
        { idempotencyKey: randomUUID(), reason: 'Received bill', proposal },
        actor.cookie,
      )
      expect(result.statusCode, result.body).toBe(200)
      const id = result.json().id
      expect((await f.request('GET', `/${joint.id}`)).json().bill.periods[0].amountCents).toBeNull()
      expect(
        (await f.request('POST', `/requests/${id}/review`, { action: 'approve' }, actor.cookie))
          .statusCode,
      ).toBe(403)
      expect(
        (await f.request('POST', `/requests/${id}/review`, { action: 'approve' })).statusCode,
      ).toBe(200)
      expect(
        (await f.request('POST', `/requests/${id}/review`, { action: 'approve' })).statusCode,
      ).toBe(409)
      expect((await f.request('GET', `/${joint.id}`)).json().bill.periods[0].amountCents).toBe(
        25000,
      )
    },
  )
  it('rejects stale or unauthorized requests and audits rejection without changing amounts', async () => {
    const f = await setup(),
      actor = await testUser(f.app, 'Admin'),
      viewer = await testUser(f.app, 'Viewer')
    const member = testRole(f.path, f.home, actor.id, 'admin')
    testRole(f.path, f.home, viewer.id, 'viewer')
    const bill = await f.create({ memberIds: [f.member, member] }),
      proposal = {
        action: 'edit_period',
        periodId: bill.periods[0].id,
        changes: { amountCents: 10000, creditCents: 0, notes: null },
      }
    expect(
      (await f.request('POST', '', { ...f.input, name: 'Viewer bill' }, viewer.cookie)).statusCode,
    ).toBe(403)
    expect(
      (
        await f.request(
          'POST',
          `/${bill.id}/requests`,
          { idempotencyKey: randomUUID(), reason: 'No', proposal },
          viewer.cookie,
        )
      ).statusCode,
    ).toBe(403)
    const id = (
      await f.request(
        'POST',
        `/${bill.id}/requests`,
        { idempotencyKey: randomUUID(), reason: 'Bill', proposal },
        actor.cookie,
      )
    ).json().id
    await f.act(bill, {
      action: 'edit_period',
      periodId: bill.periods[1].id,
      changes: { amountCents: 20000, creditCents: 0, notes: null },
    })
    expect(
      (await f.request('POST', `/requests/${id}/review`, { action: 'approve' })).statusCode,
    ).toBe(409)
    expect(
      (await f.request('POST', `/requests/${id}/review`, { action: 'reject' })).statusCode,
    ).toBe(200)
    const result = (await f.request('GET', `/${bill.id}`)).json()
    expect(result.bill.periods[0].amountCents).toBeNull()
    expect(
      result.audit.some((entry: { action: string }) => entry.action === 'request_rejected'),
    ).toBe(true)
  })
  it('uses one authoritative debt payment, excludes it from purchase spending and reflects corrections', async () => {
    const f = await setup()
    const debt = (
      await testRequest(f.app, 'POST', `/api/households/${f.home}/debts`, f.owner.cookie, {
        creditorName: 'Example loan',
        accountType: 'auto_loan',
        minimumPaymentCents: 10000,
        memberAssignments: [{ memberId: f.member, responsibility: 'primary' }],
      })
    ).json().debt
    const bill = await f.create({
      linkedDebtId: debt.id,
      amountType: 'fixed',
      amountCents: 15000,
      estimatedAmountCents: null,
    })
    expect(
      (
        await testRequest(
          f.app,
          'GET',
          `/api/households/${f.home}/debts/${debt.id}/payments`,
          f.owner.cookie,
        )
      ).json().payments,
    ).toHaveLength(0)
    const pending = await f.pending(bill, 15000),
      paymentId = pending.payments[0].id
    const confirmed = (await f.act(bill, { action: 'confirm_payment', paymentId })).json()
      .bill as BillView
    const linked = confirmed.payments[0].debtPaymentId!
    const overview = (
      await testRequest(
        f.app,
        'GET',
        `/api/households/${f.home}/overview?month=2026-10`,
        f.owner.cookie,
      )
    ).json()
    expect(overview.actual).toMatchObject({
      cashOutflowCents: 15000,
      spendingCents: 0,
      transactionCount: 1,
    })
    expect(overview.bills.householdMonthlyObligationsCents).toBe(15000)
    await testRequest(
      f.app,
      'PATCH',
      `/api/households/${f.home}/debts/${debt.id}/payments/${linked}`,
      f.owner.cookie,
      { amountCents: 12000 },
    )
    expect((await f.request('GET', `/${bill.id}`)).json().bill.periods[0].paidCents).toBe(12000)
    await f.act(bill, { action: 'cancel_payment', paymentId })
    expect(
      (
        await testRequest(
          f.app,
          'GET',
          `/api/households/${f.home}/debts/${debt.id}/payments`,
          f.owner.cookie,
        )
      ).json().payments,
    ).toHaveLength(1)
    expect(
      (
        await testRequest(
          f.app,
          'GET',
          `/api/households/${f.home}/overview?month=2026-10`,
          f.owner.cookie,
        )
      ).json().actual.cashOutflowCents,
    ).toBe(0)
  })
  it('rolls back linked payment creation if bill auditing fails', async () => {
    const f = await setup()
    const debt = (
      await testRequest(f.app, 'POST', `/api/households/${f.home}/debts`, f.owner.cookie, {
        creditorName: 'Rollback loan',
        accountType: 'auto_loan',
        memberAssignments: [{ memberId: f.member, responsibility: 'primary' }],
      })
    ).json().debt
    const bill = await f.create({ linkedDebtId: debt.id }),
      pending = await f.pending(bill),
      paymentId = pending.payments[0].id
    const sqlite = new Database(f.path)
    sqlite.exec(
      "CREATE TRIGGER fail_bill_audit BEFORE INSERT ON bill_audit BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    )
    try {
      expect((await f.act(bill, { action: 'confirm_payment', paymentId })).statusCode).toBe(500)
      expect((await f.request('GET', `/${bill.id}`)).json().bill.payments[0].status).toBe('pending')
      expect(sqlite.prepare('SELECT * FROM debt_payments').all()).toHaveLength(0)
      expect(sqlite.pragma('foreign_key_check')).toEqual([])
    } finally {
      sqlite.close()
    }
  })
  it('blocks direct debt-payment bypasses of Owner-linked bill protections', async () => {
    const f = await setup(),
      actor = await testUser(f.app, 'Admin'),
      member = testRole(f.path, f.home, actor.id, 'admin')
    const debt = (
      await testRequest(f.app, 'POST', `/api/households/${f.home}/debts`, f.owner.cookie, {
        creditorName: 'Admin loan',
        accountType: 'auto_loan',
        memberAssignments: [{ memberId: member, responsibility: 'primary' }],
      })
    ).json().debt
    const bill = await f.create({ memberIds: [f.member, member], linkedDebtId: debt.id }),
      pending = await f.pending(bill),
      paymentId = pending.payments[0].id
    const confirmed = (await f.act(bill, { action: 'confirm_payment', paymentId })).json()
      .bill as BillView
    const linkedId = confirmed.payments[0].debtPaymentId!
    const direct = await testRequest(
      f.app,
      'PATCH',
      `/api/households/${f.home}/debts/${debt.id}/payments/${linkedId}`,
      actor.cookie,
      { amountCents: 1 },
    )
    expect(direct.statusCode).toBe(403)
    const proposal = { action: 'cancel_payment', paymentId },
      id = (
        await f.request(
          'POST',
          `/${bill.id}/requests`,
          { idempotencyKey: randomUUID(), reason: 'Payment correction', proposal },
          actor.cookie,
        )
      ).json().id
    expect(id).toBeTruthy()
    expect(
      (await f.request('POST', `/requests/${id}/review`, { action: 'approve' })).statusCode,
    ).toBe(200)
    expect((await f.request('GET', `/${bill.id}`)).json().bill.payments[0].status).toBe('cancelled')
  })
  it('makes approval and request completion atomic when financial auditing fails', async () => {
    const f = await setup(),
      actor = await testUser(f.app, 'Admin'),
      member = testRole(f.path, f.home, actor.id, 'admin')
    const bill = await f.create({ memberIds: [f.member, member] }),
      pending = await f.pending(bill)
    const id = (
      await f.request(
        'POST',
        `/${bill.id}/requests`,
        {
          idempotencyKey: randomUUID(),
          reason: 'Confirm paid',
          proposal: { action: 'confirm_payment', paymentId: pending.payments[0].id },
        },
        actor.cookie,
      )
    ).json().id
    const sqlite = new Database(f.path)
    sqlite.exec(
      "CREATE TRIGGER fail_approval_audit BEFORE INSERT ON bill_audit WHEN NEW.action = 'request_approved' BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    )
    try {
      expect(
        (await f.request('POST', `/requests/${id}/review`, { action: 'approve' })).statusCode,
      ).toBe(500)
      expect((await f.request('GET', `/${bill.id}`)).json().bill.payments[0].status).toBe('pending')
      expect((await f.request('GET', '/requests')).json().requests[0].status).toBe('pending')
    } finally {
      sqlite.close()
    }
  })
})
