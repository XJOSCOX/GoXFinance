import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app'

const origin = 'http://localhost:1420'
const apps: FastifyInstance[] = []
const folders: string[] = []
async function setup(path?: string) {
  const folder = path ? undefined : mkdtempSync(join(tmpdir(), 'goxfinance-payments-'))
  if (folder) folders.push(folder)
  const databasePath = path ?? join(folder!, 'test.sqlite')
  const app = await buildApp({ databasePath, frontendOrigin: origin, secureCookie: false })
  apps.push(app)
  return { app, databasePath }
}
function request(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  cookie?: string,
  payload?: object,
) {
  return app.inject({
    method,
    url,
    ...(payload ? { payload } : {}),
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(method === 'GET' ? {} : { origin, 'x-goxfinance-request': '1' }),
    },
  })
}
async function signup(app: FastifyInstance, name: string) {
  const response = await request(app, 'POST', '/api/auth/signup', undefined, {
    fullName: name,
    email: `${name.toLowerCase()}@example.com`,
    password: 'long unique password',
    confirmPassword: 'long unique password',
  })
  expect(response.statusCode).toBe(201)
  return {
    id: response.json().user.id as string,
    cookie: String(response.headers['set-cookie']).split(';')[0],
  }
}
async function home(app: FastifyInstance, cookie: string) {
  return (await request(app, 'POST', '/api/households', cookie, { name: 'Test home' })).json()
    .household.id as string
}
async function ownerMember(app: FastifyInstance, householdId: string, cookie: string) {
  return (await request(app, 'GET', `/api/households/${householdId}/members`, cookie))
    .json()
    .members.find((member: { accessRole: string }) => member.accessRole === 'owner').id as string
}
function assign(
  path: string,
  householdId: string,
  userId: string,
  role: 'admin' | 'editor' | 'viewer',
) {
  const sqlite = new Database(path)
  const id = randomUUID(),
    now = new Date().toISOString()
  sqlite
    .prepare(
      'INSERT INTO household_members (id,household_id,linked_user_id,full_name,relationship,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run(id, householdId, userId, role, 'other', 'active', now, now)
  sqlite
    .prepare(
      'INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    )
    .run(randomUUID(), householdId, userId, role, now, now)
  sqlite.close()
  return id
}
async function createDebt(
  app: FastifyInstance,
  householdId: string,
  cookie: string,
  memberIds: string[],
) {
  const response = await request(app, 'POST', `/api/households/${householdId}/debts`, cookie, {
    creditorName: 'Example creditor',
    accountType: 'auto_loan',
    interestRateApr: '8.5',
    currentBalanceCents: 50000,
    memberAssignments: memberIds.map((memberId) => ({
      memberId,
      responsibility: memberIds.length > 1 ? 'joint' : 'primary',
    })),
  })
  expect(response.statusCode).toBe(201)
  return response.json().debt.id as string
}
const payment = (changes: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  amountCents: 5000,
  paymentDate: '2026-09-10',
  paymentStatus: 'completed',
  paymentMethod: 'bank_transfer',
  principalAmountCents: 3500,
  interestAmountCents: 1500,
  ...changes,
})
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('debt payment API', () => {
  it('persists partial payments and audit history across restarts without double completion', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'Owner')
    const householdId = await home(app, owner.cookie)
    const debtId = await createDebt(app, householdId, owner.cookie, [
      await ownerMember(app, householdId, owner.cookie),
    ])
    const base = `/api/households/${householdId}/debts/${debtId}`
    expect(
      (await request(app, 'PATCH', base, owner.cookie, { currentBalanceCents: 41000 })).statusCode,
    ).toBe(409)
    const body = payment({ paymentStatus: 'scheduled' })
    const created = await request(app, 'POST', `${base}/payments`, owner.cookie, body)
    expect(created.statusCode).toBe(201)
    const paymentId = created.json().payment.id as string
    expect(
      (await request(app, 'PATCH', `${base}/payments/${paymentId}`, owner.cookie, {})).statusCode,
    ).toBe(409)
    expect((await request(app, 'POST', `${base}/payments`, owner.cookie, body)).statusCode).toBe(
      200,
    )
    expect(
      (await request(app, 'POST', `${base}/payments`, owner.cookie, { ...body, amountCents: 9000 }))
        .statusCode,
    ).toBe(409)
    expect(
      (await request(app, 'GET', `${base}/payments`, owner.cookie)).json().overview
        .completedPaymentTotalCents,
    ).toBe(0)
    expect(
      (await request(app, 'POST', `${base}/payments/${paymentId}/confirm`, owner.cookie, {}))
        .statusCode,
    ).toBe(200)
    expect(
      (
        await request(app, 'PATCH', `${base}/payments/${paymentId}`, owner.cookie, {
          paymentStatus: 'pending',
        })
      ).statusCode,
    ).toBe(409)
    expect(
      (await request(app, 'POST', `${base}/payments/${paymentId}/confirm`, owner.cookie, {}))
        .statusCode,
    ).toBe(409)
    expect(
      (
        await request(app, 'PATCH', `${base}/payments/${paymentId}`, owner.cookie, {
          notes: 'Corrected note',
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (await request(app, 'GET', `${base}/payments/${paymentId}`, owner.cookie))
        .json()
        .audit.map((item: { action: string }) => item.action),
    ).toEqual(['created', 'confirmed', 'edited'])
    expect(
      (await request(app, 'POST', `${base}/payments/${paymentId}/cancel`, owner.cookie, {}))
        .statusCode,
    ).toBe(200)
    expect(
      (await request(app, 'POST', `${base}/payments/${paymentId}/cancel`, owner.cookie, {}))
        .statusCode,
    ).toBe(409)
    const reopened = await setup(databasePath)
    const list = await request(reopened.app, 'GET', `${base}/payments`, owner.cookie)
    expect(list.json().payments).toHaveLength(1)
    expect(list.json().payments[0].paymentStatus).toBe('cancelled')
    expect(list.json().overview.completedPaymentTotalCents).toBe(0)
    const sqlite = new Database(databasePath)
    expect(
      (
        sqlite
          .prepare('SELECT COUNT(*) AS count FROM debt_payment_audit WHERE payment_id=?')
          .get(paymentId) as { count: number }
      ).count,
    ).toBe(4)
    sqlite.close()
  })
  it('keeps verified creditor balance separate from payments and never deducts unknown principal', async () => {
    const { app } = await setup()
    const owner = await signup(app, 'Owner')
    const householdId = await home(app, owner.cookie)
    const debtId = await createDebt(app, householdId, owner.cookie, [
      await ownerMember(app, householdId, owner.cookie),
    ])
    const base = `/api/households/${householdId}/debts/${debtId}`
    expect(
      (
        await request(
          app,
          'POST',
          `${base}/payments`,
          owner.cookie,
          payment({
            principalAmountCents: 5000,
            interestAmountCents: null,
            paymentDate: '2026-09-01',
          }),
        )
      ).statusCode,
    ).toBe(201)
    expect(
      (
        await request(app, 'POST', `${base}/balances`, owner.cookie, {
          balanceCents: 40000,
          effectiveDate: '2026-09-05',
          source: 'creditor_statement',
        })
      ).statusCode,
    ).toBe(201)
    expect(
      (await request(app, 'POST', `${base}/payments`, owner.cookie, payment())).statusCode,
    ).toBe(201)
    const first = (await request(app, 'GET', `${base}/payments`, owner.cookie)).json().overview
    expect(first.lastVerifiedBalanceCents).toBe(40000)
    expect(first.completedPaymentTotalCents).toBe(10000)
    expect(first.principalSinceVerificationCents).toBe(3500)
    expect(first.estimatedOutstandingCents).toBe(36500)
    expect(
      (
        await request(
          app,
          'POST',
          `${base}/payments`,
          owner.cookie,
          payment({
            paymentDate: '2026-09-20',
            principalAmountCents: null,
            interestAmountCents: null,
          }),
        )
      ).statusCode,
    ).toBe(201)
    expect(
      (await request(app, 'GET', `${base}/balances`, owner.cookie)).json().overview
        .estimatedOutstandingCents,
    ).toBeNull()
    const next = await request(app, 'POST', `${base}/balances`, owner.cookie, {
      balanceCents: 37000,
      effectiveDate: '2026-09-25',
      source: 'reconciliation',
      notes: 'New statement',
      idempotencyKey: debtId,
    })
    expect(
      (
        await request(app, 'POST', `${base}/balances`, owner.cookie, {
          balanceCents: 37000,
          effectiveDate: '2026-09-25',
          source: 'reconciliation',
          notes: 'New statement',
          idempotencyKey: debtId,
        })
      ).statusCode,
    ).toBe(201)
    expect(next.statusCode).toBe(201)
    expect(next.json().overview.estimatedOutstandingCents).toBe(37000)
    expect(
      (await request(app, 'GET', `${base}/balances`, owner.cookie)).json().history,
    ).toHaveLength(3)
    expect((await request(app, 'GET', base, owner.cookie)).json().debt.currentBalanceCents).toBe(
      37000,
    )
    const older = await request(app, 'POST', `${base}/balances`, owner.cookie, {
      balanceCents: 39000,
      effectiveDate: '2026-09-15',
      source: 'creditor_statement',
    })
    expect(older.statusCode).toBe(201)
    expect(older.json().overview.lastVerifiedBalanceCents).toBe(37000)
    expect((await request(app, 'GET', base, owner.cookie)).json().debt.currentBalanceCents).toBe(
      37000,
    )
    expect(
      (await request(app, 'GET', `${base}/balances`, owner.cookie)).json().history,
    ).toHaveLength(4)
  })
  it('rejects invalid allocation and protects Owner, joint, viewer and cross-household records', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'Owner')
    const admin = await signup(app, 'Admin')
    const viewer = await signup(app, 'Viewer')
    const outsider = await signup(app, 'Outsider')
    const householdId = await home(app, owner.cookie)
    await home(app, outsider.cookie)
    const ownerId = await ownerMember(app, householdId, owner.cookie)
    const adminId = assign(databasePath, householdId, admin.id, 'admin')
    assign(databasePath, householdId, viewer.id, 'viewer')
    const ownerDebt = await createDebt(app, householdId, owner.cookie, [ownerId])
    const jointDebt = await createDebt(app, householdId, owner.cookie, [ownerId, adminId])
    const ownerBase = `/api/households/${householdId}/debts/${ownerDebt}`
    const jointBase = `/api/households/${householdId}/debts/${jointDebt}`
    expect(
      (await request(app, 'POST', `${ownerBase}/payments`, admin.cookie, payment())).statusCode,
    ).toBe(403)
    expect(
      (await request(app, 'POST', `${jointBase}/payments`, viewer.cookie, payment())).statusCode,
    ).toBe(403)
    expect((await request(app, 'GET', `${jointBase}/payments`, outsider.cookie)).statusCode).toBe(
      404,
    )
    expect(
      (
        await request(
          app,
          'POST',
          `${jointBase}/payments`,
          owner.cookie,
          payment({ principalAmountCents: 5000, interestAmountCents: 1000 }),
        )
      ).statusCode,
    ).toBe(400)
    expect(
      (await request(app, 'POST', `${jointBase}/payments`, admin.cookie, payment())).statusCode,
    ).toBe(403)
    const created = await request(
      app,
      'POST',
      `${jointBase}/payments`,
      admin.cookie,
      payment({ paymentStatus: 'pending' }),
    )
    expect(created.statusCode).toBe(201)
    const id = created.json().payment.id as string
    expect(
      (
        await request(app, 'PATCH', `${jointBase}/payments/${id}`, admin.cookie, {
          notes: 'Changed',
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (await request(app, 'POST', `${jointBase}/payments/${id}/cancel`, admin.cookie, {}))
        .statusCode,
    ).toBe(403)
    expect(
      (
        await request(app, 'POST', `${jointBase}/balances`, admin.cookie, {
          balanceCents: 30000,
          effectiveDate: '2026-09-20',
          source: 'creditor_statement',
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await request(app, 'PATCH', `${jointBase}/payments/${id}`, owner.cookie, {
          notes: 'Owner approved correction',
        })
      ).statusCode,
    ).toBe(200)
  })
})
