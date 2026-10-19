import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app'

const origin = 'http://localhost:1420'
const folders: string[] = []
const apps: FastifyInstance[] = []

async function testApp(path?: string) {
  const folder = path ? undefined : mkdtempSync(join(tmpdir(), 'goxfinance-household-'))
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

async function signup(app: FastifyInstance, email: string, fullName: string) {
  const response = await request(app, 'POST', '/api/auth/signup', undefined,
    { fullName, email, password: 'long unique password', confirmPassword: 'long unique password' })
  expect(response.statusCode).toBe(201)
  const cookie = String(response.headers['set-cookie']).split(';')[0]
  return { cookie, userId: response.json().user.id as string }
}

async function createHousehold(app: FastifyInstance, cookie: string, name = 'Our home') {
  const response = await request(app, 'POST', '/api/households', cookie, { name })
  expect(response.statusCode).toBe(201)
  return response.json().household.id as string
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('household setup and access', () => {
  it('saves optional household details without changing existing member records', async () => {
    const { app, databasePath } = await testApp()
    const { cookie } = await signup(app, 'alex@example.com', 'Alex')
    const id = await createHousehold(app, cookie)
    const updated = await request(app, 'PATCH', `/api/households/${id}`, cookie,
      { name: 'New home', moveInDate: '2025-06-01', notes: 'Moved in together' })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().household).toMatchObject({ name: 'New home', moveInDate: '2025-06-01', notes: 'Moved in together' })
    expect((await request(app, 'PATCH', `/api/households/${id}`, cookie, { moveInDate: 'not-a-date' })).statusCode).toBe(400)
    const reopened = await testApp(databasePath)
    const detail = await request(reopened.app, 'GET', `/api/households/${id}`, cookie)
    expect(detail.json().household.moveInDate).toBe('2025-06-01')
    expect((await request(reopened.app, 'GET', `/api/households/${id}/members`, cookie)).json().members).toHaveLength(1)
  })
  it('creates owner, role, and linked member atomically; repeated setup is idempotent', async () => {
    const { app, databasePath } = await testApp()
    const { cookie, userId } = await signup(app, 'alex@example.com', 'Alex Example')
    expect((await request(app, 'GET', '/api/households', cookie)).json().households).toEqual([])
    const id = await createHousehold(app, cookie)
    const repeat = await request(app, 'POST', '/api/households', cookie, { name: 'Another home' })
    expect(repeat.statusCode).toBe(200)
    expect(repeat.json().household.id).toBe(id)
    const db = new Database(databasePath)
    expect((db.prepare('SELECT count(*) AS total FROM households').get() as { total: number }).total).toBe(1)
    const role = db.prepare('SELECT role FROM household_user_roles WHERE household_id=? AND user_id=?').get(id, userId) as { role: string }
    expect(role.role).toBe('owner')
    const member = db.prepare('SELECT linked_user_id, full_name, relationship FROM household_members WHERE household_id=?').get(id) as { linked_user_id: string; full_name: string; relationship: string }
    expect(member).toMatchObject({ linked_user_id: userId, full_name: 'Alex Example', relationship: 'self' })
    db.close()
    const reopened = await testApp(databasePath)
    const list = await request(reopened.app, 'GET', '/api/households', cookie)
    expect(list.json().households).toHaveLength(1)
    expect(list.json().households[0].role).toBe('owner')
  })

  it('persists member CRUD, deactivates instead of deleting, and blocks owner removal', async () => {
    const { app, databasePath } = await testApp()
    const { cookie } = await signup(app, 'alex@example.com', 'Alex')
    const id = await createHousehold(app, cookie)
    const url = `/api/households/${id}/members`
    const added = await request(app, 'POST', url, cookie, { fullName: 'Blair', relationship: 'spouse', notes: 'Family member' })
    expect(added.statusCode).toBe(201)
    const memberId = added.json().member.id as string
    expect(added.json().member.linkedUserId).toBeNull()
    expect(added.json().member.accessRole).toBeNull()
    const detail = await request(app, 'GET', `${url}/${memberId}`, cookie)
    expect(detail.json().member.fullName).toBe('Blair')
    const updated = await request(app, 'PATCH', `${url}/${memberId}`, cookie, { fullName: 'Blair A.', status: 'active', notes: null })
    expect(updated.json().member.fullName).toBe('Blair A.')
    expect(updated.json().member.notes).toBeNull()
    expect((await request(app, 'DELETE', `${url}/${memberId}`, cookie)).statusCode).toBe(204)
    expect((await request(app, 'GET', `${url}/${memberId}`, cookie)).json().member.status).toBe('inactive')
    const db = new Database(databasePath)
    expect((db.prepare('SELECT count(*) AS total FROM household_members WHERE id=?').get(memberId) as { total: number }).total).toBe(1)
    db.close()
    const owner = (await request(app, 'GET', url, cookie)).json().members.find((member: { accessRole: string }) => member.accessRole === 'owner')
    expect((await request(app, 'DELETE', `${url}/${owner.id}`, cookie)).statusCode).toBe(403)
    expect((await request(app, 'PATCH', `${url}/${owner.id}`, cookie, { status: 'inactive' })).statusCode).toBe(403)
  })

  it('does not disclose another household by guessed UUID', async () => {
    const { app } = await testApp()
    const a = await signup(app, 'alex@example.com', 'Alex')
    const b = await signup(app, 'blair@example.com', 'Blair')
    const id = await createHousehold(app, a.cookie)
    const memberId = (await request(app, 'GET', `/api/households/${id}/members`, a.cookie)).json().members[0].id
    expect((await request(app, 'GET', `/api/households/${id}`, b.cookie)).statusCode).toBe(404)
    expect((await request(app, 'GET', `/api/households/${id}/members`, b.cookie)).statusCode).toBe(404)
    expect((await request(app, 'GET', `/api/households/${id}/members/${memberId}`, b.cookie)).statusCode).toBe(404)
    expect((await request(app, 'POST', `/api/households/${id}/members`, b.cookie, { fullName: 'Intruder', relationship: 'other' })).statusCode).toBe(404)
    expect((await request(app, 'GET', '/api/households')).statusCode).toBe(401)
  })

  it('enforces viewer, editor, and admin permissions in the API', async () => {
    const { app, databasePath } = await testApp()
    const owner = await signup(app, 'owner@example.com', 'Owner')
    const viewer = await signup(app, 'viewer@example.com', 'Viewer')
    const editor = await signup(app, 'editor@example.com', 'Editor')
    const admin = await signup(app, 'admin@example.com', 'Admin')
    const id = await createHousehold(app, owner.cookie)
    const db = new Database(databasePath)
    const assign = db.prepare('INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    const now = new Date().toISOString()
    for (const [userId, role] of [[viewer.userId, 'viewer'], [editor.userId, 'editor'], [admin.userId, 'admin']]) {
      assign.run(randomUUID(), id, userId, role, now, now)
    }
    db.close()
    const url = `/api/households/${id}/members`
    const body = { fullName: 'Child', relationship: 'child' }
    expect((await request(app, 'GET', url, viewer.cookie)).statusCode).toBe(200)
    expect((await request(app, 'POST', url, viewer.cookie, body)).statusCode).toBe(403)
    const child = await request(app, 'POST', url, editor.cookie, body)
    expect(child.statusCode).toBe(201)
    const childId = child.json().member.id as string
    expect((await request(app, 'PATCH', `${url}/${childId}`, editor.cookie, { fullName: 'Child A.' })).statusCode).toBe(200)
    expect((await request(app, 'PATCH', `${url}/${childId}`, editor.cookie, { status: 'inactive' })).statusCode).toBe(403)
    expect((await request(app, 'DELETE', `${url}/${childId}`, editor.cookie)).statusCode).toBe(403)
    const ownerMemberId = (await request(app, 'GET', url, admin.cookie)).json().members.find((member: { accessRole: string }) => member.accessRole === 'owner').id
    expect((await request(app, 'DELETE', `${url}/${ownerMemberId}`, admin.cookie)).statusCode).toBe(403)
    expect((await request(app, 'PATCH', `/api/households/${id}`, viewer.cookie, { name: 'Changed' })).statusCode).toBe(403)
    expect((await request(app, 'PATCH', `/api/households/${id}`, admin.cookie, { name: 'Updated home' })).statusCode).toBe(200)
    expect((await request(app, 'DELETE', `${url}/${childId}`, admin.cookie)).statusCode).toBe(204)
  })

  it('rejects privilege changes in member input and enforces database constraints', async () => {
    const { app, databasePath } = await testApp()
    const owner = await signup(app, 'owner@example.com', 'Owner')
    const id = await createHousehold(app, owner.cookie)
    const url = `/api/households/${id}/members`
    expect((await request(app, 'POST', url, owner.cookie, { fullName: 'Impostor', relationship: 'other', role: 'owner' })).statusCode).toBe(400)
    const db = new Database(databasePath)
    db.pragma('foreign_keys = ON')
    const now = new Date().toISOString()
    const insertRole = db.prepare('INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    expect(() => insertRole.run(randomUUID(), id, owner.userId, 'admin', now, now)).toThrow()
    expect(() => insertRole.run(randomUUID(), randomUUID(), owner.userId, 'viewer', now, now)).toThrow()
    expect(() => insertRole.run(randomUUID(), id, randomUUID(), 'viewer', now, now)).toThrow()
    expect(() => insertRole.run(randomUUID(), id, owner.userId, 'superuser', now, now)).toThrow()
    db.close()
  })
})
