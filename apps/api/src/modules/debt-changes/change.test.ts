import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app'
import { testHome, testOrigin, testRequest as request, testRole, testUser } from '../../testing/workspace'

const apps: FastifyInstance[] = [], folders: string[] = []
async function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'goxfinance-approval-')); folders.push(folder)
  const path = join(folder, 'test.sqlite'), app = await buildApp({ databasePath: path, frontendOrigin: testOrigin, secureCookie: false }); apps.push(app)
  const owner = await testUser(app, 'Owner'), admin = await testUser(app, 'Admin'), editor = await testUser(app, 'Editor'), viewer = await testUser(app, 'Viewer')
  const { home, member } = await testHome(app, owner.cookie)
  const adminId = testRole(path, home, admin.id, 'admin'), editorId = testRole(path, home, editor.id, 'editor')
  testRole(path, home, viewer.id, 'viewer')
  const debt = (await request(app, 'POST', `/api/households/${home}/debts`, owner.cookie, { creditorName: 'Test creditor', accountType: 'auto_loan',
    currentBalanceCents: 100000, memberAssignments: [member, adminId, editorId].map(memberId => ({ memberId, responsibility: 'joint' })) })).json().debt.id as string
  const base = `/api/households/${home}/debts/${debt}`
  const payment = (await request(app, 'POST', `${base}/payments`, owner.cookie, { idempotencyKey: randomUUID(), amountCents: 10000,
    paymentDate: '2026-01-10', paymentStatus: 'completed', paymentMethod: 'bank_transfer', principalAmountCents: 7000 })).json().payment
  const requests = `/api/households/${home}/debt-change-requests`
  return { app, path, owner, admin, editor, viewer, home, debt, base, payment, requests }
}
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

it('holds Admin/Editor requests until Owner approval and applies each exact change once', async () => {
  const f = await setup()
  const input = { action: 'edit_payment', paymentId: f.payment.id, changes: { amountCents: 12000, paymentDate: f.payment.paymentDate,
    paymentStatus: 'completed', paymentMethod: 'bank_transfer', principalAmountCents: 9000 }, reason: 'Correct creditor receipt', idempotencyKey: randomUUID() }
  const submitted = await request(f.app, 'POST', `${f.base}/change-requests`, f.admin.cookie, input)
  expect(submitted.statusCode).toBe(201)
  const id = submitted.json().requestId as string
  expect((await request(f.app, 'POST', `${f.base}/change-requests`, f.admin.cookie, input)).json().requestId).toBe(id)
  expect((await request(f.app, 'GET', `${f.base}/payments/${f.payment.id}`, f.owner.cookie)).json().payment.amountCents).toBe(10000)
  expect((await request(f.app, 'POST', `${f.requests}/${id}/approve`, f.admin.cookie, { confirmed: true })).statusCode).toBe(403)
  const attempts = await Promise.all([request(f.app, 'POST', `${f.requests}/${id}/approve`, f.owner.cookie, { confirmed: true }),
    request(f.app, 'POST', `${f.requests}/${id}/approve`, f.owner.cookie, { confirmed: true })])
  expect(attempts.map(item => item.statusCode).sort()).toEqual([200, 409])
  expect((await request(f.app, 'GET', `${f.base}/payments/${f.payment.id}`, f.owner.cookie)).json().payment.amountCents).toBe(12000)
  const cancel = await request(f.app, 'POST', `${f.base}/change-requests`, f.editor.cookie, { action: 'cancel_payment', paymentId: f.payment.id,
    reason: 'Payment reversed', idempotencyKey: randomUUID() })
  expect(cancel.statusCode).toBe(201)
  expect((await request(f.app, 'POST', `${f.requests}/${cancel.json().requestId}/approve`, f.owner.cookie, { confirmed: true })).statusCode).toBe(200)
  expect((await request(f.app, 'GET', `${f.base}/payments/${f.payment.id}`, f.owner.cookie)).json().payment.paymentStatus).toBe('cancelled')
  const balance = await request(f.app, 'POST', `${f.base}/change-requests`, f.editor.cookie, { action: 'verify_balance', reason: 'New statement', idempotencyKey: randomUUID(),
    changes: { balanceCents: 88000, effectiveDate: '2026-01-31', source: 'creditor_statement' } })
  expect((await request(f.app, 'POST', `${f.requests}/${balance.json().requestId}/approve`, f.owner.cookie, { confirmed: true })).statusCode).toBe(200)
  expect((await request(f.app, 'GET', f.base, f.owner.cookie)).json().debt.currentBalanceCents).toBe(88000)
  const db = new Database(f.path)
  expect((db.prepare('SELECT COUNT(*) AS count FROM debt_change_audit').get() as { count: number }).count).toBe(6)
  db.close()
})

it('rejects/withdraws without changing records and denies viewers, exclusive Owner debts and cross-household access', async () => {
  const f = await setup(), body = { action: 'cancel_payment', paymentId: f.payment.id, reason: 'Please check', idempotencyKey: randomUUID() }
  expect((await request(f.app, 'POST', `${f.base}/change-requests`, f.viewer.cookie, body)).statusCode).toBe(403)
  const outsider = await testUser(f.app, 'Outsider'), other = await testHome(f.app, outsider.cookie)
  expect((await request(f.app, 'POST', `${f.base}/change-requests`, outsider.cookie, body)).statusCode).toBe(404)
  const id = (await request(f.app, 'POST', `${f.base}/change-requests`, f.admin.cookie, body)).json().requestId as string
  expect((await request(f.app, 'POST', `/api/households/${other.home}/debt-change-requests/${id}/approve`, outsider.cookie, { confirmed: true })).statusCode).toBe(404)
  expect((await request(f.app, 'POST', `${f.requests}/${id}/reject`, f.owner.cookie, { confirmed: true, note: 'Receipt is correct' })).statusCode).toBe(200)
  expect((await request(f.app, 'GET', `${f.base}/payments/${f.payment.id}`, f.owner.cookie)).json().payment.paymentStatus).toBe('completed')
  const second = (await request(f.app, 'POST', `${f.base}/change-requests`, f.admin.cookie, { ...body, idempotencyKey: randomUUID() })).json().requestId
  expect((await request(f.app, 'POST', `${f.requests}/${second}/cancel`, f.admin.cookie, { confirmed: true })).statusCode).toBe(200)
  expect((await request(f.app, 'GET', f.requests, f.viewer.cookie)).json().requests).toEqual([])
})

it('rejects stale approvals and rolls back changes if the approval audit cannot be written', async () => {
  const f = await setup(), body = { action: 'cancel_payment', paymentId: f.payment.id, reason: 'Please check', idempotencyKey: randomUUID() }
  const id = (await request(f.app, 'POST', `${f.base}/change-requests`, f.admin.cookie, body)).json().requestId as string
  await request(f.app, 'PATCH', `${f.base}/payments/${f.payment.id}`, f.owner.cookie, { notes: 'Changed since request' })
  expect((await request(f.app, 'POST', `${f.requests}/${id}/approve`, f.owner.cookie, { confirmed: true })).statusCode).toBe(409)
  await request(f.app, 'POST', `${f.requests}/${id}/reject`, f.owner.cookie, { confirmed: true })
  const fresh = (await request(f.app, 'POST', `${f.base}/change-requests`, f.admin.cookie, { ...body, idempotencyKey: randomUUID() })).json().requestId
  const db = new Database(f.path)
  db.exec("CREATE TRIGGER test_approval_failure BEFORE INSERT ON debt_change_audit WHEN NEW.action='approved' BEGIN SELECT RAISE(ABORT,'test rollback'); END")
  expect((await request(f.app, 'POST', `${f.requests}/${fresh}/approve`, f.owner.cookie, { confirmed: true })).statusCode).toBe(500)
  expect((await request(f.app, 'GET', `${f.base}/payments/${f.payment.id}`, f.owner.cookie)).json().payment.paymentStatus).toBe('completed')
  expect((await request(f.app, 'GET', f.requests, f.owner.cookie)).json().requests.find((item: { id: string }) => item.id === fresh).status).toBe('pending')
  db.close()
})

it('protects Owner-exclusive debts and rechecks the requester role at approval time', async () => {
  const f = await setup()
  const ownerMember = (await request(f.app, 'GET', `/api/households/${f.home}/members`, f.owner.cookie)).json().members
    .find((member: { accessRole: string }) => member.accessRole === 'owner').id as string
  const exclusive = (await request(f.app, 'POST', `/api/households/${f.home}/debts`, f.owner.cookie,
    { creditorName: 'Owner account', accountType: 'credit_card', memberAssignments: [{ memberId: ownerMember, responsibility: 'primary' }] })).json().debt.id
  const change = { action: 'verify_balance', reason: 'Statement', idempotencyKey: randomUUID(),
    changes: { balanceCents: 88000, effectiveDate: '2026-01-31', source: 'creditor_statement' } }
  expect((await request(f.app, 'POST', `/api/households/${f.home}/debts/${exclusive}/change-requests`, f.admin.cookie, change)).statusCode).toBe(403)
  const id = (await request(f.app, 'POST', `${f.base}/change-requests`, f.admin.cookie, change)).json().requestId
  const db = new Database(f.path)
  db.prepare("UPDATE household_user_roles SET role='viewer' WHERE household_id=? AND user_id=?").run(f.home, f.admin.id)
  expect((await request(f.app, 'POST', `${f.requests}/${id}/approve`, f.owner.cookie, { confirmed: true })).statusCode).toBe(403)
  expect((await request(f.app, 'GET', f.base, f.owner.cookie)).json().debt.currentBalanceCents).toBe(100000)
  db.close()
})

it('lets the Owner approve scheduled-payment confirmation without recording a second payment', async () => {
  const f = await setup()
  const payment = (await request(f.app, 'POST', `${f.base}/payments`, f.admin.cookie, { idempotencyKey: randomUUID(),
    amountCents: 5000, paymentDate: '2026-02-10', paymentStatus: 'scheduled', paymentMethod: 'bank_transfer' })).json().payment
  const id = (await request(f.app, 'POST', `${f.base}/change-requests`, f.admin.cookie, { action: 'confirm_payment', paymentId: payment.id,
    reason: 'Payment posted', idempotencyKey: randomUUID() })).json().requestId
  expect((await request(f.app, 'POST', `${f.requests}/${id}/approve`, f.owner.cookie, { confirmed: true })).statusCode).toBe(200)
  const records = (await request(f.app, 'GET', `${f.base}/payments`, f.owner.cookie)).json().payments
  expect(records).toHaveLength(2)
  expect(records.find((item: { id: string }) => item.id === payment.id).paymentStatus).toBe('completed')
})
