import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import type { IncomeSourceInput, IncomeTransactionInput } from '@goxfinance/shared'
import { buildApp } from '../../app'
import { testHome, testOrigin, testRequest, testRole, testUser } from '../../testing/workspace'
const apps: FastifyInstance[] = [],
  folders: string[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})
async function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'gox-income-'))
  folders.push(folder)
  const path = join(folder, 'test.sqlite'),
    app = await buildApp({ databasePath: path, frontendOrigin: testOrigin, secureCookie: false })
  apps.push(app)
  const owner = await testUser(app, 'Owner'),
    { home, member } = await testHome(app, owner.cookie),
    base = `/api/households/${home}/income`
  const request = (
    method: 'GET' | 'POST' | 'PATCH',
    suffix: string,
    payload?: object,
    cookie = owner.cookie,
  ) => testRequest(app, method, base + suffix, cookie, payload)
  const values: IncomeSourceInput = {
    name: 'Fictional job',
    responsibleMemberId: member,
    incomeType: 'hourly',
    frequency: 'weekly',
    hourlyRateCents: 2500,
    expectedGrossCents: null,
    expectedNetCents: 70000,
    payday: 4,
    overtimeMultiplier: '1',
    status: 'active',
    notes: null,
  }
  const create = async (changes: Partial<IncomeSourceInput> = {}, cookie = owner.cookie) => {
    const response = await request(
      'POST',
      '/sources',
      { idempotencyKey: randomUUID(), values: { ...values, ...changes } },
      cookie,
    )
    expect(response.statusCode, response.body).toBe(201)
    return response.json().source
  }
  const paycheck = (
    sourceId: string,
    changes: Partial<IncomeTransactionInput> = {},
  ): IncomeTransactionInput => ({
    sourceId,
    workPeriodStart: '2026-10-01',
    workPeriodEnd: '2026-10-07',
    regularHours: '31',
    overtimeHours: '2',
    hourlyRateCents: 2500,
    overtimeMultiplier: '1.5',
    expectedGrossCents: null,
    expectedNetCents: 70000,
    actualGrossCents: null,
    deductionsCents: null,
    actualNetCents: null,
    payDate: '2026-10-08',
    depositDate: null,
    status: 'pending',
    reference: null,
    notes: null,
    receiptConfirmed: false,
    tradingPayoutWithdrawn: false,
    ...changes,
  })
  return { path, app, owner, home, member, base, request, values, create, paycheck }
}
it('records snapshots, confirms late pay, corrects with revisions and persists audit and sessions after restart', async () => {
  const f = await setup(),
    source = await f.create(),
    key = randomUUID(),
    values = f.paycheck(source.id)
  const pending = await f.request('POST', '/transactions', { idempotencyKey: key, values })
  expect(pending.statusCode, pending.body).toBe(201)
  const row = pending.json().transaction
  expect(row.estimatedGrossCents).toBe(85000)
  expect(row.confirmedAt).toBeNull()
  expect(
    (await f.request('POST', '/transactions', { idempotencyKey: key, values })).json().transaction
      .id,
  ).toBe(row.id)
  const edited = await f.request('PATCH', `/sources/${source.id}`, {
    revision: 1,
    reason: 'New hourly rate',
    values: { ...f.values, hourlyRateCents: 3000 },
  })
  expect(edited.statusCode, edited.body).toBe(200)
  const confirmedValues = {
    ...values,
    status: 'confirmed',
    actualGrossCents: 85000,
    deductionsCents: 12000,
    actualNetCents: 73000,
    depositDate: '2026-10-09',
    receiptConfirmed: true,
  }
  const result = await f.request('PATCH', `/transactions/${row.id}`, {
    revision: 1,
    reason: 'Received late',
    values: confirmedValues,
  })
  expect(result.statusCode, result.body).toBe(200)
  expect(result.json().transaction).toMatchObject({
    hourlyRateCents: 2500,
    estimatedGrossCents: 85000,
    revision: 2,
    payDate: '2026-10-08',
    depositDate: '2026-10-09',
  })
  expect(result.json().transaction.confirmedAt).toBeTruthy()
  expect(
    (
      await f.request('PATCH', `/transactions/${row.id}`, {
        revision: 1,
        reason: 'Stale edit',
        values: confirmedValues,
      })
    ).statusCode,
  ).toBe(409)
  const corrected = await f.request('PATCH', `/transactions/${row.id}`, {
    revision: 2,
    reason: 'Correct deposit',
    values: { ...confirmedValues, actualNetCents: 72000 },
  })
  expect(corrected.statusCode).toBe(200)
  await f.app.close()
  apps.splice(apps.indexOf(f.app), 1)
  const reopened = await buildApp({
    databasePath: f.path,
    frontendOrigin: testOrigin,
    secureCookie: false,
  })
  apps.push(reopened)
  const list = (await testRequest(reopened, 'GET', f.base, f.owner.cookie)).json()
  expect(list.transactions).toHaveLength(1)
  expect(list.transactions[0]).toMatchObject({
    actualNetCents: 72000,
    revision: 3,
    hourlyRateCents: 2500,
  })
  expect(list.sources[0].hourlyRateCents).toBe(3000)
  const audit = (
    await testRequest(reopened, 'GET', `${f.base}/sources/${source.id}`, f.owner.cookie)
  ).json().audit
  expect(audit.map((v: { action: string }) => v.action)).toEqual([
    'source_created',
    'income_recorded',
    'source_corrected',
    'income_confirmed',
    'income_corrected',
  ])
  expect(audit.at(-1).beforeJson).toContain('73000')
})
it('prevents duplicates across keys, work periods, regular pay dates and references', async () => {
  const f = await setup(),
    source = await f.create(),
    values = f.paycheck(source.id),
    key = randomUUID()
  expect(
    (await f.request('POST', '/transactions', { idempotencyKey: key, values })).statusCode,
  ).toBe(201)
  for (const changes of [
    {},
    { payDate: '2026-10-15' },
    { workPeriodStart: null, workPeriodEnd: null },
  ])
    expect(
      (
        await f.request('POST', '/transactions', {
          idempotencyKey: randomUUID(),
          values: { ...values, ...changes },
        })
      ).statusCode,
    ).toBe(409)
  expect(
    (
      await f.request('POST', '/transactions', {
        idempotencyKey: key,
        values: { ...values, expectedNetCents: 1 },
      })
    ).statusCode,
  ).toBe(409)
  const irregular = await f.create({ incomeType: 'self_employment', frequency: 'irregular' })
  const entry = f.paycheck(irregular.id, {
    workPeriodStart: null,
    workPeriodEnd: null,
    reference: 'invoice-one',
  })
  expect(
    (await f.request('POST', '/transactions', { idempotencyKey: randomUUID(), values: entry }))
      .statusCode,
  ).toBe(201)
  expect(
    (
      await f.request('POST', '/transactions', {
        idempotencyKey: randomUUID(),
        values: { ...entry, payDate: '2026-10-09' },
      })
    ).statusCode,
  ).toBe(409)
  expect(
    (
      await f.request('POST', '/transactions', {
        idempotencyKey: randomUUID(),
        values: { ...entry, reference: 'invoice-two' },
      })
    ).statusCode,
  ).toBe(201)
  expect((await f.request('GET', '')).json().transactions).toHaveLength(3)
})
it('supports military, salary, benefits, side income and only actually withdrawn trading payouts', async () => {
  const f = await setup()
  for (const type of [
    'military',
    'salary',
    'benefits',
    'self_employment',
    'other',
    'trading_payout',
  ] as const) {
    const source = await f.create({
      incomeType: type,
      frequency: 'irregular',
      hourlyRateCents: null,
    })
    const values = f.paycheck(source.id, {
      regularHours: null,
      overtimeHours: null,
      hourlyRateCents: null,
      workPeriodStart: null,
      workPeriodEnd: null,
      status: 'confirmed',
      actualNetCents: 12345,
      depositDate: '2026-10-08',
      receiptConfirmed: true,
    })
    if (type === 'trading_payout')
      expect(
        (await f.request('POST', '/transactions', { idempotencyKey: randomUUID(), values }))
          .statusCode,
      ).toBe(400)
    const response = await f.request('POST', '/transactions', {
      idempotencyKey: randomUUID(),
      values: { ...values, tradingPayoutWithdrawn: type === 'trading_payout' },
    })
    expect(response.statusCode, response.body).toBe(201)
  }
  const source = await f.create()
  expect(
    (
      await f.request('POST', '/transactions', {
        idempotencyKey: randomUUID(),
        values: f.paycheck(source.id, { status: 'confirmed' }),
      })
    ).statusCode,
  ).toBe(400)
  expect(
    (
      await f.request('POST', '/transactions', {
        idempotencyKey: randomUUID(),
        values: f.paycheck(source.id, {
          status: 'confirmed',
          receiptConfirmed: true,
          actualNetCents: 100,
          depositDate: '2099-01-01',
        }),
      })
    ).statusCode,
  ).toBe(400)
})
it('protects Owner records, isolates households and permits Admin and Editor own income only', async () => {
  const f = await setup(),
    source = await f.create()
  const ownerPay = (
    await f.request('POST', '/transactions', {
      idempotencyKey: randomUUID(),
      values: f.paycheck(source.id),
    })
  ).json().transaction
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const person = await testUser(f.app, role),
      member = testRole(f.path, f.home, person.id, role)
    expect(
      (
        await f.request(
          'PATCH',
          `/sources/${source.id}`,
          { revision: 1, reason: 'Attack', values: { ...f.values, name: 'Changed' } },
          person.cookie,
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await f.request(
          'POST',
          `/sources/${source.id}/archive`,
          { revision: 1, isArchived: true },
          person.cookie,
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await f.request(
          'POST',
          '/transactions',
          { idempotencyKey: randomUUID(), values: f.paycheck(source.id) },
          person.cookie,
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await f.request(
          'PATCH',
          `/transactions/${ownerPay.id}`,
          { revision: 1, reason: 'Unauthorized correction', values: f.paycheck(source.id) },
          person.cookie,
        )
      ).statusCode,
    ).toBe(403)
    const own = await f.request(
      'POST',
      '/sources',
      { idempotencyKey: randomUUID(), values: { ...f.values, responsibleMemberId: member } },
      person.cookie,
    )
    expect(own.statusCode, own.body).toBe(role === 'viewer' ? 403 : 201)
    if (role !== 'viewer') {
      const ownSource = own.json().source
      expect(
        (
          await f.request(
            'POST',
            '/transactions',
            { idempotencyKey: randomUUID(), values: f.paycheck(ownSource.id) },
            person.cookie,
          )
        ).statusCode,
      ).toBe(201)
      expect(
        (
          await f.request(
            'PATCH',
            `/sources/${ownSource.id}`,
            {
              revision: 1,
              reason: 'Reassign',
              values: { ...f.values, responsibleMemberId: f.member },
            },
            person.cookie,
          )
        ).statusCode,
      ).toBe(403)
    }
  }
  const outsider = await testUser(f.app, 'Outsider'),
    outside = await testHome(f.app, outsider.cookie)
  expect((await f.request('GET', '', undefined, outsider.cookie)).statusCode).toBe(404)
  expect(
    (await f.request('GET', `/sources/${source.id}`, undefined, outsider.cookie)).statusCode,
  ).toBe(404)
  expect(
    (
      await f.request('POST', '/sources', {
        idempotencyKey: randomUUID(),
        values: { ...f.values, responsibleMemberId: outside.member },
      })
    ).statusCode,
  ).toBe(400)
  expect((await f.request('GET', '')).json().transactions).toHaveLength(3)
})
it('keeps expected and pending income out of dashboard cash flow and cancels confirmed deposits with audit', async () => {
  const f = await setup(),
    source = await f.create()
  for (const [i, status] of ['expected', 'pending', 'confirmed'].entries()) {
    const values = f.paycheck(source.id, {
      status: status as IncomeTransactionInput['status'],
      workPeriodStart: null,
      workPeriodEnd: null,
      payDate: `2026-10-0${i + 1}`,
      actualNetCents: status === 'confirmed' ? 50000 : null,
      depositDate: status === 'confirmed' ? '2026-10-03' : null,
      receiptConfirmed: status === 'confirmed',
    })
    expect(
      (await f.request('POST', '/transactions', { idempotencyKey: randomUUID(), values }))
        .statusCode,
    ).toBe(201)
  }
  const debt = (
    await testRequest(f.app, 'POST', `/api/households/${f.home}/debts`, f.owner.cookie, {
      creditorName: 'Example loan',
      accountType: 'personal_loan',
      memberAssignments: [{ memberId: f.member, responsibility: 'primary' }],
    })
  ).json().debt
  await testRequest(
    f.app,
    'POST',
    `/api/households/${f.home}/debts/${debt.id}/payments`,
    f.owner.cookie,
    {
      idempotencyKey: randomUUID(),
      amountCents: 10000,
      paymentDate: '2026-10-03',
      paymentStatus: 'completed',
      paymentMethod: 'cash',
    },
  )
  const overview = (
    await testRequest(
      f.app,
      'GET',
      `/api/households/${f.home}/overview?month=2026-10`,
      f.owner.cookie,
    )
  ).json()
  expect(overview.income).toEqual({ confirmedCents: 50000, netRecordedCashFlowCents: 40000 })
  const transaction = (await f.request('GET', ''))
    .json()
    .transactions.find((v: { status: string }) => v.status === 'confirmed')
  const values = f.paycheck(source.id, {
    status: 'cancelled',
    workPeriodStart: null,
    workPeriodEnd: null,
    payDate: '2026-10-03',
    actualNetCents: 50000,
    depositDate: '2026-10-03',
    receiptConfirmed: true,
  })
  expect(
    (
      await f.request('PATCH', `/transactions/${transaction.id}`, {
        values,
        revision: 1,
        reason: 'Deposit reversed',
      })
    ).statusCode,
  ).toBe(200)
  expect(
    (
      await testRequest(
        f.app,
        'GET',
        `/api/households/${f.home}/overview?month=2026-10`,
        f.owner.cookie,
      )
    ).json().income.confirmedCents,
  ).toBe(0)
})
it('rolls back writes if audit fails and enforces scoped foreign keys and confirmation constraints', async () => {
  const f = await setup(),
    source = await f.create(),
    sql = new Database(f.path)
  try {
    sql.pragma('foreign_keys = ON')
    sql.exec(
      "CREATE TRIGGER fail_income_audit BEFORE INSERT ON income_audit BEGIN SELECT RAISE(ABORT,'test rollback'); END;",
    )
    expect(
      (
        await f.request('POST', '/transactions', {
          idempotencyKey: randomUUID(),
          values: f.paycheck(source.id),
        })
      ).statusCode,
    ).toBe(500)
    expect((await f.request('GET', '')).json().transactions).toHaveLength(0)
    sql.exec('DROP TRIGGER fail_income_audit')
    const response = await f.request('POST', '/transactions', {
      idempotencyKey: randomUUID(),
      values: f.paycheck(source.id),
    })
    const id = response.json().transaction.id
    expect(() =>
      sql.prepare("UPDATE income_transactions SET status='confirmed' WHERE id=?").run(id),
    ).toThrow()
    expect(() =>
      sql.prepare('UPDATE income_transactions SET source_id=? WHERE id=?').run(randomUUID(), id),
    ).toThrow()
    expect(sql.pragma('foreign_key_check')).toEqual([])
  } finally {
    sql.close()
  }
})
it('archives and restores sources without deleting pay history, and uses source idempotency', async () => {
  const f = await setup(),
    key = randomUUID(),
    created = await f.request('POST', '/sources', { idempotencyKey: key, values: f.values })
  const source = created.json().source
  expect(
    (await f.request('POST', '/sources', { idempotencyKey: key, values: f.values })).json().source
      .id,
  ).toBe(source.id)
  await f.request('POST', '/transactions', {
    idempotencyKey: randomUUID(),
    values: f.paycheck(source.id),
  })
  expect(
    (await f.request('POST', `/sources/${source.id}/archive`, { revision: 1, isArchived: true }))
      .statusCode,
  ).toBe(200)
  expect((await f.request('GET', '')).json().transactions).toHaveLength(1)
  expect(
    (
      await f.request('POST', '/transactions', {
        idempotencyKey: randomUUID(),
        values: f.paycheck(source.id, {
          payDate: '2026-10-15',
          workPeriodStart: null,
          workPeriodEnd: null,
        }),
      })
    ).statusCode,
  ).toBe(400)
  expect(
    (await f.request('POST', `/sources/${source.id}/archive`, { revision: 2, isArchived: false }))
      .statusCode,
  ).toBe(200)
})

it('keeps trading receipt restrictions after the source type changes and rejects unsafe monetary inputs', async () => {
  const f = await setup(),
    source = await f.create({ incomeType: 'trading_payout', frequency: 'irregular' })
  const values = f.paycheck(source.id, { regularHours: null, overtimeHours: null })
  const transaction = (
    await f.request('POST', '/transactions', { idempotencyKey: randomUUID(), values })
  ).json().transaction
  expect(
    (
      await f.request('PATCH', '/sources/' + source.id, {
        revision: 1,
        reason: 'Source changed',
        values: { ...f.values, incomeType: 'other', frequency: 'irregular' },
      })
    ).statusCode,
  ).toBe(200)
  expect(
    (
      await f.request('PATCH', '/transactions/' + transaction.id, {
        revision: 1,
        reason: 'Confirm',
        values: {
          ...values,
          status: 'confirmed',
          actualNetCents: 10000,
          depositDate: '2026-10-08',
          receiptConfirmed: true,
        },
      })
    ).statusCode,
  ).toBe(400)
  expect(
    (
      await f.request('POST', '/sources', {
        idempotencyKey: randomUUID(),
        values: { ...f.values, hourlyRateCents: 25.001 },
      })
    ).statusCode,
  ).toBe(400)
  expect(
    (
      await f.request('POST', '/transactions', {
        idempotencyKey: randomUUID(),
        values: { ...values, actualNetCents: Number.MAX_SAFE_INTEGER + 1 },
      })
    ).statusCode,
  ).toBe(400)
})
