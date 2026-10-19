import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app'
import { testHome, testRequest as request, testRole, testUser } from '../../testing/workspace'

const apps: FastifyInstance[] = [], folders: string[] = []
async function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'goxfinance-account-approval-')); folders.push(folder)
  const path = join(folder, 'test.sqlite'), app = await buildApp({ databasePath: path, frontendOrigin: 'http://localhost:1420', secureCookie: false }); apps.push(app)
  const owner = await testUser(app, 'Owner'), admin = await testUser(app, 'Admin'), editor = await testUser(app, 'Editor'), viewer = await testUser(app, 'Viewer')
  const { home, member } = await testHome(app, owner.cookie)
  const adminId = testRole(path, home, admin.id, 'admin'), editorId = testRole(path, home, editor.id, 'editor')
  testRole(path, home, viewer.id, 'viewer')
  const base = `/api/households/${home}/debts`, requests = `/api/households/${home}/debt-change-requests`
  const assignments = [member, adminId, editorId].map(memberId => ({ memberId, responsibility: 'joint' }))
  const debt = (await request(app, 'POST', base, owner.cookie, { creditorName: 'Fictional lender', accountType: 'auto_loan',
    currentBalanceCents: 100000, memberAssignments: assignments })).json().debt
  return { app, path, owner, admin, editor, viewer, home, member, adminId, editorId, assignments, base, requests, debt, target: `${base}/${debt.id}` }
}
const proposal = <T extends object>(changes: T) => ({ action: 'edit_account', changes, reason: 'Fictional account correction', idempotencyKey: randomUUID() })
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

it('blocks every direct account mutation on Owner joint debts for Admin, Editor and Viewer', async () => {
  const f = await setup()
  const patches = [{ creditorName: 'Changed' }, { currentBalanceCents: 5 }, { originalBalanceCents: 5 }, { minimumPaymentCents: 5 },
    { accountStatus: 'closed' }, { paymentStatus: 'paid' }, { collectionAgency: 'Collector' },
    { linkedOriginalDebtId: randomUUID() }, { duplicateLinkVerified: true }, { creditLimitCents: 5 },
    { memberAssignments: [{ memberId: f.adminId, responsibility: 'primary' }] }, { notes: 'Attempted bypass' }]
  for (const user of [f.admin, f.editor, f.viewer]) {
    for (const patch of patches) expect((await request(f.app, 'PATCH', f.target, user.cookie, patch)).statusCode).toBe(403)
    expect((await request(f.app, 'DELETE', f.target, user.cookie)).statusCode).toBe(403)
    expect((await request(f.app, 'POST', `${f.target}/restore`, user.cookie, {})).statusCode).toBe(403)
    // Linking a new collection to the protected original must not bypass protection.
    expect((await request(f.app, 'POST', f.base, user.cookie, { creditorName: 'Collection', accountType: 'collection',
      linkedOriginalDebtId: f.debt.id, duplicateLinkVerified: true,
      memberAssignments: [{ memberId: user === f.editor ? f.editorId : f.adminId, responsibility: 'primary' }] })).statusCode).toBe(403)
  }
  expect((await request(f.app, 'GET', f.target, f.owner.cookie)).json().debt).toEqual(f.debt)
  expect((await request(f.app, 'PATCH', f.target, f.owner.cookie, { creditorName: 'Owner correction' })).statusCode).toBe(200)
})

it('keeps Owner-only debts inaccessible for non-owner management and rejects cross-household requests', async () => {
  const f = await setup()
  const exclusive = (await request(f.app, 'POST', f.base, f.owner.cookie, { creditorName: 'Owner only', accountType: 'credit_card',
    memberAssignments: [{ memberId: f.member, responsibility: 'primary' }] })).json().debt.id
  for (const user of [f.admin, f.editor, f.viewer]) {
    expect((await request(f.app, 'PATCH', `${f.base}/${exclusive}`, user.cookie, { creditorName: 'Attempt' })).statusCode).toBe(403)
    expect((await request(f.app, 'POST', `${f.base}/${exclusive}/change-requests`, user.cookie, proposal({ creditorName: 'Attempt' }))).statusCode).toBe(403)
    expect((await request(f.app, 'DELETE', `${f.base}/${exclusive}`, user.cookie)).statusCode).toBe(403)
  }
  expect((await request(f.app, 'POST', `${f.target}/change-requests`, f.viewer.cookie, proposal({ creditorName: 'Attempt' }))).statusCode).toBe(403)
  const outsider = await testUser(f.app, 'Outsider'), other = await testHome(f.app, outsider.cookie)
  expect((await request(f.app, 'PATCH', f.target, outsider.cookie, { creditorName: 'Attempt' })).statusCode).toBe(404)
  expect((await request(f.app, 'POST', `${f.target}/change-requests`, outsider.cookie, proposal({ creditorName: 'Attempt' }))).statusCode).toBe(404)
  const id = (await request(f.app, 'POST', `${f.target}/change-requests`, f.admin.cookie, proposal({ creditorName: 'Proposed' }))).json().requestId
  expect((await request(f.app, 'POST', `/api/households/${other.home}/debt-change-requests/${id}/approve`, outsider.cookie, { confirmed: true })).statusCode).toBe(404)
  const foreign = [{ memberId: other.member, responsibility: 'primary' }]
  expect((await request(f.app, 'POST', `${f.target}/change-requests`, f.editor.cookie, proposal({ memberAssignments: foreign }))).statusCode).toBe(400)
})

it.each(['admin', 'editor'] as const)('applies exact %s account proposals once, including memberships, links and archive/restore', async role => {
  const f = await setup()
  const proposer = f[role]
  const original = (await request(f.app, 'POST', f.base, f.owner.cookie, { creditorName: 'Original creditor', accountType: 'credit_card',
    memberAssignments: f.assignments })).json().debt.id
  const input = proposal({ creditorName: 'Corrected lender', accountStatus: 'closed', paymentStatus: 'charged_off',
    originalBalanceCents: 120000, collectionAgency: 'Fictional agency', linkedOriginalDebtId: original, duplicateLinkVerified: true,
    memberAssignments: [{ memberId: f.member, responsibility: 'primary' }, { memberId: f.editorId, responsibility: 'joint' }] })
  const response = await request(f.app, 'POST', `${f.target}/change-requests`, proposer.cookie, input)
  expect(response.statusCode).toBe(201)
  const id = response.json().requestId
  expect((await request(f.app, 'POST', `${f.target}/change-requests`, proposer.cookie, input)).json().requestId).toBe(id)
  expect((await request(f.app, 'GET', f.target, f.owner.cookie)).json().debt.creditorName).toBe('Fictional lender')
  for (const user of [f.admin, f.editor, f.viewer]) expect((await request(f.app, 'POST', `${f.requests}/${id}/approve`, user.cookie, { confirmed: true })).statusCode).toBe(403)
  const attempts = await Promise.all([1, 2].map(() => request(f.app, 'POST', `${f.requests}/${id}/approve`, f.owner.cookie, { confirmed: true })))
  expect(attempts.map(item => item.statusCode).sort()).toEqual([200, 409])
  const applied = (await request(f.app, 'GET', f.target, f.owner.cookie)).json().debt
  expect(applied).toMatchObject({ ...input.changes, memberAssignments: expect.arrayContaining(input.changes.memberAssignments) })
  expect(applied.memberAssignments).toHaveLength(2)
  expect(applied.currentBalanceCents).toBe(100000)
  // The responsible Editor may propose archiving this Owner joint debt, but cannot apply it.
  const archive = (await request(f.app, 'POST', `${f.target}/change-requests`, f.editor.cookie,
    { action: 'archive_account', reason: 'Archive request', idempotencyKey: randomUUID() })).json().requestId
  expect((await request(f.app, 'POST', `${f.requests}/${archive}/approve`, f.owner.cookie, { confirmed: true })).statusCode).toBe(200)
  expect((await request(f.app, 'POST', `${f.target}/restore`, f.editor.cookie, {})).statusCode).toBe(403)
  const restore = await request(f.app, 'POST', `${f.target}/change-requests`, f.editor.cookie,
    { action: 'restore_account', reason: 'Restore request', idempotencyKey: randomUUID() })
  expect(restore.statusCode).toBe(201)
  expect((await request(f.app, 'POST', `${f.requests}/${restore.json().requestId}/approve`, f.owner.cookie, { confirmed: true })).statusCode).toBe(200)
  expect((await request(f.app, 'GET', f.target, f.owner.cookie)).json().debt.isArchived).toBe(false)
})

it('rejects stale records and revoked requesters, and preserves history on rejection or withdrawal', async () => {
  const f = await setup(), body = proposal({ creditorName: 'Proposed lender' })
  const id = (await request(f.app, 'POST', `${f.target}/change-requests`, f.admin.cookie, body)).json().requestId
  expect((await request(f.app, 'POST', `${f.target}/change-requests`, f.admin.cookie, proposal({ notes: 'Duplicate pending' }))).statusCode).toBe(409)
  await request(f.app, 'PATCH', f.target, f.owner.cookie, { notes: 'Owner changed the original' })
  expect((await request(f.app, 'POST', `${f.requests}/${id}/approve`, f.owner.cookie, { confirmed: true })).statusCode).toBe(409)
  expect((await request(f.app, 'POST', `${f.requests}/${id}/reject`, f.owner.cookie, { confirmed: true })).statusCode).toBe(200)
  const fresh = (await request(f.app, 'POST', `${f.target}/change-requests`, f.admin.cookie, proposal({ creditorName: 'Withdrawn lender' }))).json().requestId
  expect((await request(f.app, 'POST', `${f.requests}/${fresh}/cancel`, f.editor.cookie, { confirmed: true })).statusCode).toBe(403)
  expect((await request(f.app, 'POST', `${f.requests}/${fresh}/cancel`, f.admin.cookie, { confirmed: true })).statusCode).toBe(200)
  const revoked = (await request(f.app, 'POST', `${f.target}/change-requests`, f.editor.cookie, proposal({ notes: 'Revoked request' }))).json().requestId
  const db = new Database(f.path)
  db.prepare("UPDATE household_user_roles SET role='viewer' WHERE household_id=? AND user_id=?").run(f.home, f.editor.id)
  expect((await request(f.app, 'POST', `${f.requests}/${revoked}/approve`, f.owner.cookie, { confirmed: true })).statusCode).toBe(403)
  expect((await request(f.app, 'GET', f.target, f.owner.cookie)).json().debt.creditorName).toBe('Fictional lender')
  expect((db.prepare('SELECT COUNT(*) AS count FROM debt_change_audit').get() as { count: number }).count).toBe(5)
  db.close()
})

it('rolls back account edits, requests and reviews when their audit operation fails', async () => {
  const f = await setup(), db = new Database(f.path), body = proposal({ creditorName: 'Must roll back',
    memberAssignments: [{ memberId: f.member, responsibility: 'primary' }, { memberId: f.adminId, responsibility: 'joint' }] })
  db.exec("CREATE TRIGGER fail_submit BEFORE INSERT ON debt_change_audit WHEN NEW.action='submitted' BEGIN SELECT RAISE(ABORT,'test'); END")
  expect((await request(f.app, 'POST', `${f.target}/change-requests`, f.admin.cookie, body)).statusCode).toBe(500)
  expect((await request(f.app, 'GET', f.requests, f.owner.cookie)).json().requests).toHaveLength(0)
  db.exec('DROP TRIGGER fail_submit')
  const id = (await request(f.app, 'POST', `${f.target}/change-requests`, f.admin.cookie, body)).json().requestId
  for (const action of ['approved', 'rejected', 'cancelled']) {
    db.exec(`CREATE TRIGGER fail_review BEFORE INSERT ON debt_change_audit WHEN NEW.action='${action}' BEGIN SELECT RAISE(ABORT,'test'); END`)
    const endpoint = action === 'approved' ? 'approve' : action === 'rejected' ? 'reject' : 'cancel'
    expect((await request(f.app, 'POST', `${f.requests}/${id}/${endpoint}`, action === 'cancelled' ? f.admin.cookie : f.owner.cookie, { confirmed: true })).statusCode).toBe(500)
    expect((await request(f.app, 'GET', f.target, f.owner.cookie)).json().debt).toEqual(f.debt)
    expect((await request(f.app, 'GET', f.requests, f.owner.cookie)).json().requests[0].status).toBe('pending')
    db.exec('DROP TRIGGER fail_review')
  }
  db.close()
})

it('requires Balance History for current balances and does not accept invalid links or metadata', async () => {
  const f = await setup()
  for (const changes of [{}, { currentBalanceCents: 1 }, { balanceVerifiedAt: '2026-01-01T00:00:00.000Z' },
    { linkedOriginalDebtId: f.debt.id }, { linkedOriginalDebtId: randomUUID() }, { isArchived: true }, { createdByUserId: f.admin.id }]) {
    const response = await request(f.app, 'POST', `${f.target}/change-requests`, f.admin.cookie, proposal(changes))
    expect([400, 409]).toContain(response.statusCode)
  }
  expect((await request(f.app, 'GET', f.requests, f.owner.cookie)).json().requests).toHaveLength(0)
})
