import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import type { ExpenseCategory, ExpenseInput } from '@goxfinance/shared'
import { buildApp } from '../../app'
import { testHome, testOrigin, testRequest, testRole, testUser } from '../../testing/workspace'

const apps: FastifyInstance[] = [],
  folders: string[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})
async function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'gox-expenses-'))
  folders.push(folder)
  const path = join(folder, 'test.sqlite'),
    app = await buildApp({ databasePath: path, frontendOrigin: testOrigin, secureCookie: false })
  apps.push(app)
  const owner = await testUser(app, 'Owner'),
    { home, member } = await testHome(app, owner.cookie),
    base = `/api/households/${home}/expenses`
  const request = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    suffix: string,
    payload?: object,
    cookie = owner.cookie,
  ) => testRequest(app, method, base + suffix, cookie, payload)
  await request('POST', '/initialize')
  const categories = (await request('GET', '')).json().categories as ExpenseCategory[]
  const input: ExpenseInput = {
    description: 'Fictional grocery purchase',
    merchant: 'Example shop',
    amountCents: 12550,
    transactionDate: '2026-10-01',
    responsibleMemberId: member,
    paymentMethod: 'debit_card',
    linkedDebtId: null,
    notes: null,
    allocations: [{ categoryId: categories[0].id, amountCents: 12550 }],
  }
  return { path, app, owner, home, member, base, request, categories, input }
}
it('persists CRUD, split allocations and audit history across API restarts', async () => {
  const f = await setup(),
    input = {
      ...f.input,
      allocations: [
        { categoryId: f.categories[0].id, amountCents: 10000 },
        { categoryId: f.categories[1].id, amountCents: 2550 },
      ],
    }
  const created = await f.request('POST', '', { expense: input, idempotencyKey: randomUUID() })
  expect(created.statusCode, created.body).toBe(201)
  const expense = created.json().expense
  const correction = await f.request('PATCH', '/' + expense.id, {
    revision: expense.revision,
    expense: { ...input, merchant: 'Corrected merchant' },
  })
  expect(correction.statusCode).toBe(200)
  expect(
    (await f.request('PATCH', '/' + expense.id, { revision: expense.revision, expense: input }))
      .statusCode,
  ).toBe(409)
  await f.app.close()
  apps.splice(apps.indexOf(f.app), 1)
  const app = await buildApp({
    databasePath: f.path,
    frontendOrigin: testOrigin,
    secureCookie: false,
  })
  apps.push(app)
  const read = await testRequest(app, 'GET', f.base + '/' + expense.id, f.owner.cookie)
  expect(read.statusCode).toBe(200)
  expect(read.json().expense.merchant).toBe('Corrected merchant')
  expect(read.json().expense.allocations).toHaveLength(2)
  expect(read.json().audit).toHaveLength(2)
  const removed = await testRequest(app, 'DELETE', f.base + '/' + expense.id, f.owner.cookie, {
    revision: 2,
  })
  expect(removed.statusCode).toBe(200)
  const result = (await testRequest(app, 'GET', f.base + '/' + expense.id, f.owner.cookie)).json()
  expect(result.expense.voided).toBe(true)
  expect(result.audit).toHaveLength(3)
  expect(
    (
      await testRequest(
        app,
        'GET',
        `/api/households/${f.home}/overview?month=2026-10`,
        f.owner.cookie,
      )
    ).json().actual.spendingCents,
  ).toBe(0)
})
it('rejects invalid splits, duplicate categories, unsafe cents, and foreign categories', async () => {
  const f = await setup()
  for (const input of [
    { ...f.input, allocations: [{ categoryId: f.categories[0].id, amountCents: 1 }] },
    {
      ...f.input,
      amountCents: 2,
      allocations: [
        { categoryId: f.categories[0].id, amountCents: 1 },
        { categoryId: f.categories[0].id, amountCents: 1 },
      ],
    },
    { ...f.input, amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { ...f.input, transactionDate: '2026-02-30' },
    { ...f.input, allocations: [{ categoryId: randomUUID(), amountCents: 12550 }] },
  ]) {
    expect(
      (await f.request('POST', '', { expense: input, idempotencyKey: randomUUID() })).statusCode,
    ).toBe(400)
  }
  expect((await f.request('GET', '')).json().expenses).toHaveLength(0)
})
it('protects duplicate submission keys and rejects changed payloads', async () => {
  const f = await setup(),
    idempotencyKey = randomUUID(),
    body = { idempotencyKey, expense: f.input }
  const first = await f.request('POST', '', body),
    retry = await f.request('POST', '', body)
  expect(first.statusCode).toBe(201)
  expect(retry.statusCode).toBe(201)
  expect(first.json().expense.id).toBe(retry.json().expense.id)
  expect(
    (await f.request('POST', '', { ...body, expense: { ...f.input, merchant: 'Changed' } }))
      .statusCode,
  ).toBe(409)
  expect((await f.request('GET', '')).json().expenses).toHaveLength(1)
})
it.each(['admin', 'editor', 'viewer'] as const)(
  'enforces %s permissions, Owner protections and household isolation',
  async (role) => {
    const f = await setup(),
      actor = await testUser(f.app, role),
      member = testRole(f.path, f.home, actor.id, role)
    const expense = (
      await f.request('POST', '', { expense: f.input, idempotencyKey: randomUUID() })
    ).json().expense
    expect(
      (await f.request('PATCH', '/' + expense.id, { revision: 1, expense: f.input }, actor.cookie))
        .statusCode,
    ).toBe(403)
    expect(
      (await f.request('DELETE', '/' + expense.id, { revision: 1 }, actor.cookie)).statusCode,
    ).toBe(403)
    expect(
      (
        await f.request(
          'POST',
          '',
          { expense: f.input, idempotencyKey: randomUUID() },
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
    const own = await f.request(
      'POST',
      '',
      { expense: { ...f.input, responsibleMemberId: member }, idempotencyKey: randomUUID() },
      actor.cookie,
    )
    expect(own.statusCode, own.body).toBe(role === 'viewer' ? 403 : 201)
    if (role !== 'viewer') {
      const id = own.json().expense.id
      expect(
        (
          await f.request(
            'PATCH',
            '/' + id,
            {
              revision: 1,
              expense: { ...f.input, responsibleMemberId: member, notes: 'Corrected' },
            },
            actor.cookie,
          )
        ).statusCode,
      ).toBe(200)
      expect((await f.request('DELETE', '/' + id, { revision: 2 }, actor.cookie)).statusCode).toBe(
        200,
      )
    }
    const outsider = await testUser(f.app, 'Outsider')
    expect((await f.request('GET', '/' + expense.id, undefined, outsider.cookie)).statusCode).toBe(
      404,
    )
    expect(
      (await f.request('DELETE', '/' + expense.id, { revision: 1 }, outsider.cookie)).statusCode,
    ).toBe(404)
    const otherHome = await testHome(f.app, outsider.cookie)
    expect(
      (
        await testRequest(
          f.app,
          'GET',
          `/api/households/${otherHome.home}/expenses/${expense.id}`,
          outsider.cookie,
        )
      ).statusCode,
    ).toBe(404)
  },
)
it('separates credit purchases from repayments without changing debt balances', async () => {
  const f = await setup()
  const debt = (
    await testRequest(f.app, 'POST', `/api/households/${f.home}/debts`, f.owner.cookie, {
      creditorName: 'Example card',
      accountType: 'credit_card',
      currentBalanceCents: 10000,
      memberAssignments: [{ memberId: f.member, responsibility: 'primary' }],
    })
  ).json().debt
  expect(
    (
      await f.request('POST', '', {
        expense: { ...f.input, paymentMethod: 'credit_card', linkedDebtId: debt.id },
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
  ).toBe(201)
  await testRequest(
    f.app,
    'POST',
    `/api/households/${f.home}/debts/${debt.id}/payments`,
    f.owner.cookie,
    {
      idempotencyKey: randomUUID(),
      amountCents: 12550,
      paymentDate: '2026-10-02',
      paymentStatus: 'completed',
      paymentMethod: 'bank_transfer',
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
  expect(overview.actual).toMatchObject({
    spendingCents: 12550,
    cashOutflowCents: 12550,
    transactionCount: 2,
  })
  expect(overview.debts.debts[0].currentBalanceCents).toBe(10000)
  const outsider = await testUser(f.app, 'Other')
  expect(
    (await testRequest(f.app, 'GET', `/api/households/${f.home}/overview`, outsider.cookie))
      .statusCode,
  ).toBe(404)
  expect(
    (
      await testRequest(
        f.app,
        'GET',
        `/api/households/${f.home}/overview?month=invalid`,
        f.owner.cookie,
      )
    ).statusCode,
  ).toBe(400)
})
it('rolls back an expense and its allocations if the audit write fails; enforces foreign keys', async () => {
  const f = await setup(),
    sqlite = new Database(f.path)
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(
    "CREATE TRIGGER fail_expense_audit BEFORE INSERT ON expense_audit BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
  )
  try {
    expect(
      (await f.request('POST', '', { expense: f.input, idempotencyKey: randomUUID() })).statusCode,
    ).toBe(500)
    expect((await f.request('GET', '')).json().expenses).toHaveLength(0)
    expect(sqlite.prepare('SELECT * FROM expense_category_allocations').all()).toHaveLength(0)
    expect(() =>
      sqlite
        .prepare(
          'INSERT INTO expense_category_allocations (expense_id,household_id,category_id,amount_cents) VALUES (?,?,?,?)',
        )
        .run(randomUUID(), f.home, f.categories[0].id, 1),
    ).toThrow()
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
  } finally {
    sqlite.close()
  }
})
