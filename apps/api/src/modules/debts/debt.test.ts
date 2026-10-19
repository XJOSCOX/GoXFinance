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
  const folder = path ? undefined : mkdtempSync(join(tmpdir(), 'goxfinance-debts-'))
  if (folder) folders.push(folder)
  const databasePath = path ?? join(folder!, 'test.sqlite')
  const app = await buildApp({ databasePath, frontendOrigin: origin, secureCookie: false })
  apps.push(app)
  return { app, databasePath }
}
function request(app: FastifyInstance, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, cookie?: string, payload?: object) {
  return app.inject({ method, url, ...(payload ? { payload } : {}), headers: {
    ...(cookie ? { cookie } : {}), ...(method === 'GET' ? {} : { origin, 'x-goxfinance-request': '1' }),
  } })
}
async function signup(app: FastifyInstance, name: string) {
  const response = await request(app, 'POST', '/api/auth/signup', undefined, {
    fullName: name, email: `${name.toLowerCase()}@example.com`, password: 'long unique password', confirmPassword: 'long unique password',
  })
  expect(response.statusCode).toBe(201)
  return { id: response.json().user.id as string, cookie: String(response.headers['set-cookie']).split(';')[0] }
}
async function home(app: FastifyInstance, cookie: string) {
  return (await request(app, 'POST', '/api/households', cookie, { name: 'Test home' })).json().household.id as string
}
function assign(path: string, householdId: string, userId: string, role: 'admin' | 'editor' | 'viewer') {
  const db = new Database(path)
  const id = randomUUID(), now = new Date().toISOString()
  db.prepare('INSERT INTO household_members (id,household_id,linked_user_id,full_name,relationship,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, householdId, userId, role, 'other', 'active', now, now)
  db.prepare('INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), householdId, userId, role, now, now)
  db.close()
  return id
}
async function ownerMember(app: FastifyInstance, homeId: string, cookie: string) {
  const members = (await request(app, 'GET', `/api/households/${homeId}/members`, cookie)).json().members
  return members.find((member: { accessRole: string }) => member.accessRole === 'owner').id as string
}
const debt = (memberId: string, changes: Record<string, unknown> = {}) => ({ creditorName: 'Sample lender', accountType: 'credit_card',
  currentBalanceCents: 12345, memberAssignments: [{ memberId, responsibility: 'primary' }], ...changes })
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('household debt API', () => {
  it('persists create, edit, archive and restore across reopening SQLite', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'Owner')
    const homeId = await home(app, owner.cookie)
    const base = `/api/households/${homeId}/debts`
    const memberId = await ownerMember(app, homeId, owner.cookie)
    const created = await request(app, 'POST', base, owner.cookie, debt(memberId, { accountStatus: 'closed', paymentStatus: 'charged_off', currentBalanceCents: null }))
    expect(created.statusCode).toBe(201)
    const id = created.json().debt.id as string
    expect(created.json().debt.currentBalanceCents).toBeNull()
    expect((await request(app, 'PATCH', `${base}/${id}`, owner.cookie, { creditorName: 'Updated lender' })).json().debt.creditorName).toBe('Updated lender')
    expect((await request(app, 'DELETE', `${base}/${id}`, owner.cookie)).json().debt.isArchived).toBe(true)
    expect((await request(app, 'GET', base, owner.cookie)).json().summary.accountCount).toBe(0)
    expect((await request(app, 'POST', `${base}/${id}/restore`, owner.cookie, {})).json().debt.isArchived).toBe(false)
    const reopened = await setup(databasePath)
    const list = await request(reopened.app, 'GET', base, owner.cookie)
    expect(list.json().debts).toHaveLength(1)
    expect(list.json().debts[0].currentBalanceCents).toBeNull()
    expect(list.json().summary.unknownBalanceCount).toBe(1)
  })
  it('enforces role, Owner, cross-household and member relationship rules', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'Owner')
    const admin = await signup(app, 'Admin')
    const editor = await signup(app, 'Editor')
    const viewer = await signup(app, 'Viewer')
    const outsider = await signup(app, 'Outsider')
    const homeId = await home(app, owner.cookie)
    const otherHome = await home(app, outsider.cookie)
    const ownerId = await ownerMember(app, homeId, owner.cookie)
    const adminId = assign(databasePath, homeId, admin.id, 'admin')
    const editorId = assign(databasePath, homeId, editor.id, 'editor')
    assign(databasePath, homeId, viewer.id, 'viewer')
    const base = `/api/households/${homeId}/debts`
    const ownerDebt = (await request(app, 'POST', base, owner.cookie, debt(ownerId))).json().debt.id as string
    expect((await request(app, 'PATCH', `${base}/${ownerDebt}`, admin.cookie, { creditorName: 'Changed' })).statusCode).toBe(403)
    expect((await request(app, 'DELETE', `${base}/${ownerDebt}`, admin.cookie)).statusCode).toBe(403)
    expect((await request(app, 'POST', base, viewer.cookie, debt(adminId))).statusCode).toBe(403)
    expect((await request(app, 'POST', base, editor.cookie, debt(adminId))).statusCode).toBe(403)
    expect((await request(app, 'POST', base, admin.cookie, debt(ownerId))).statusCode).toBe(403)
    expect((await request(app, 'POST', base, owner.cookie, debt(randomUUID()))).statusCode).toBe(400)
    expect((await request(app, 'POST', base, owner.cookie, debt((await ownerMember(app, otherHome, outsider.cookie))))).statusCode).toBe(400)
    expect((await request(app, 'GET', base, outsider.cookie)).statusCode).toBe(404)
    const editorDebt = (await request(app, 'POST', base, editor.cookie, debt(editorId))).json().debt.id as string
    expect((await request(app, 'PATCH', `${base}/${editorDebt}`, admin.cookie, { creditorName: 'Changed' })).statusCode).toBe(403)
    expect((await request(app, 'PATCH', `${base}/${editorDebt}`, editor.cookie, { creditorName: 'Changed' })).statusCode).toBe(200)
    expect((await request(app, 'PATCH', `${base}/${editorDebt}`, viewer.cookie, { creditorName: 'Changed' })).statusCode).toBe(403)
  })
  it('counts confirmed duplicates once and leaves unverified links separate', async () => {
    const { app } = await setup()
    const owner = await signup(app, 'Owner')
    const homeId = await home(app, owner.cookie)
    const ownerId = await ownerMember(app, homeId, owner.cookie)
    const base = `/api/households/${homeId}/debts`
    const originalId = (await request(app, 'POST', base, owner.cookie, debt(ownerId))).json().debt.id as string
    const collection = await request(app, 'POST', base, owner.cookie, debt(ownerId, {
      creditorName: 'Collection firm', accountType: 'collection', currentBalanceCents: 10000,
      linkedOriginalDebtId: originalId, duplicateLinkVerified: false,
    }))
    expect(collection.statusCode).toBe(201)
    expect((await request(app, 'GET', base, owner.cookie)).json().summary.confirmedBalanceCents).toBe(0)
    expect((await request(app, 'GET', base, owner.cookie)).json().summary.unverifiedBalanceCents).toBe(22345)
    expect((await request(app, 'PATCH', `${base}/${collection.json().debt.id}`, owner.cookie,
      { duplicateLinkVerified: true })).statusCode).toBe(200)
    expect((await request(app, 'GET', base, owner.cookie)).json().summary.unverifiedBalanceCents).toBe(12345)
  })
  it('keeps a joint account single and enforces same-household member foreign keys', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'Owner')
    const admin = await signup(app, 'Admin')
    const outsider = await signup(app, 'Outsider')
    const homeId = await home(app, owner.cookie)
    const otherHome = await home(app, outsider.cookie)
    const ownerId = await ownerMember(app, homeId, owner.cookie)
    const adminId = assign(databasePath, homeId, admin.id, 'admin')
    const outsiderId = await ownerMember(app, otherHome, outsider.cookie)
    const base = `/api/households/${homeId}/debts`
    const created = await request(app, 'POST', base, owner.cookie, debt(ownerId, {
      memberAssignments: [{ memberId: ownerId, responsibility: 'joint' }, { memberId: adminId, responsibility: 'joint' }],
      confidence: 'confirmed',
    }))
    expect(created.statusCode).toBe(201)
    expect((await request(app, 'GET', base, owner.cookie)).json().summary.confirmedBalanceCents).toBe(12345)
    expect((await request(app, 'PATCH', `${base}/${created.json().debt.id}`, admin.cookie,
      { creditorName: 'Updated creditor' })).statusCode).toBe(403)
    const db = new Database(databasePath)
    db.pragma('foreign_keys = ON')
    expect(() => db.prepare('INSERT INTO debt_members (debt_id,household_id,household_member_id,responsibility,created_at) VALUES (?,?,?,?,?)')
      .run(created.json().debt.id, homeId, outsiderId, 'joint', new Date().toISOString())).toThrow()
    db.close()
    expect((await request(app, 'POST', base, admin.cookie, debt(adminId))).statusCode).toBe(201)
  })
})
