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

async function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'goxfinance-access-'))
  folders.push(folder)
  const databasePath = join(folder, 'test.sqlite')
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
  const response = await request(app, 'POST', '/api/households', cookie, { name: 'Family home' })
  expect(response.statusCode).toBe(201)
  return response.json().household.id as string
}
async function member(app: FastifyInstance, cookie: string, householdId: string, fullName: string) {
  const response = await request(app, 'POST', `/api/households/${householdId}/members`, cookie,
    { fullName, relationship: 'other' })
  expect(response.statusCode).toBe(201)
  return response.json().member.id as string
}
function assign(dbPath: string, householdId: string, userId: string, fullName: string, role: 'admin' | 'editor' | 'viewer') {
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  const now = new Date().toISOString()
  const memberId = randomUUID()
  db.prepare('INSERT INTO household_members (id,household_id,linked_user_id,full_name,relationship,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(memberId, householdId, userId, fullName, 'other', 'active', null, now, now)
  db.prepare('INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), householdId, userId, role, now, now)
  db.close()
  return memberId
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('protected ownership and member approval', () => {
  it('keeps the creator as immutable Owner in the API and SQLite', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'Owner')
    const admin = await signup(app, 'Admin')
    const householdId = await home(app, owner.cookie)
    assign(databasePath, householdId, admin.id, 'Admin', 'admin')
    const ownerMember = (await request(app, 'GET', `/api/households/${householdId}/members`, owner.cookie)).json()
      .members.find((item: { accessRole: string }) => item.accessRole === 'owner')
    expect(ownerMember.linkedUserId).toBe(owner.id)
    expect((await request(app, 'PATCH', `/api/households/${householdId}/members/${ownerMember.id}`, admin.cookie,
      { fullName: 'Changed owner' })).statusCode).toBe(403)
    expect((await request(app, 'DELETE', `/api/households/${householdId}/members/${ownerMember.id}`, admin.cookie)).statusCode).toBe(403)
    expect((await request(app, 'PATCH', `/api/households/${householdId}/members/${ownerMember.id}/role`, admin.cookie,
      { role: 'viewer' })).statusCode).toBe(403)
    expect((await request(app, 'PATCH', `/api/households/${householdId}/members/${ownerMember.id}/role`, owner.cookie,
      { role: 'viewer' })).statusCode).toBe(403)
    expect((await request(app, 'DELETE', `/api/households/${householdId}/members/${ownerMember.id}`, owner.cookie)).statusCode).toBe(403)
    const db = new Database(databasePath)
    db.pragma('foreign_keys = ON')
    expect(() => db.prepare("UPDATE household_user_roles SET role='viewer' WHERE household_id=? AND user_id=?")
      .run(householdId, owner.id)).toThrow()
    expect(() => db.prepare('DELETE FROM household_user_roles WHERE household_id=? AND user_id=?')
      .run(householdId, owner.id)).toThrow()
    expect(() => db.prepare('INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), householdId, admin.id, 'owner', new Date().toISOString(), new Date().toISOString())).toThrow()
    expect(() => db.prepare("UPDATE household_members SET status='inactive' WHERE id=?").run(ownerMember.id)).toThrow()
    expect(() => db.prepare('UPDATE households SET created_by_user_id=? WHERE id=?').run(admin.id, householdId)).toThrow()
    expect(() => db.prepare('DELETE FROM households WHERE id=?').run(householdId)).toThrow()
    db.close()
  })

  it('holds Admin and Editor proposals until Owner approval, then creates one member with an audit trail', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'Owner')
    const admin = await signup(app, 'Admin')
    const editor = await signup(app, 'Editor')
    const viewer = await signup(app, 'Viewer')
    const householdId = await home(app, owner.cookie)
    const adminMemberId = assign(databasePath, householdId, admin.id, 'Admin', 'admin')
    assign(databasePath, householdId, editor.id, 'Editor', 'editor')
    assign(databasePath, householdId, viewer.id, 'Viewer', 'viewer')
    const base = `/api/households/${householdId}/member-requests`
    const body = { fullName: 'Child', relationship: 'child', notes: 'Family' }
    expect((await request(app, 'POST', base, viewer.cookie, body)).statusCode).toBe(403)
    expect((await request(app, 'POST', `/api/households/${householdId}/members`, admin.cookie, body)).statusCode).toBe(403)
    const proposal = await request(app, 'POST', base, admin.cookie, body)
    expect(proposal.statusCode).toBe(201)
    const requestId = proposal.json().request.id as string
    expect((await request(app, 'POST', base, admin.cookie, body)).statusCode).toBe(409)
    expect((await request(app, 'POST', base, editor.cookie, { fullName: 'Cousin', relationship: 'other' })).statusCode).toBe(201)
    expect((await request(app, 'GET', base, admin.cookie)).statusCode).toBe(403)
    expect((await request(app, 'GET', base, owner.cookie)).json().requests.find((item: { id: string }) => item.id === requestId))
      .toMatchObject({ status: 'pending', proposedByName: 'Admin' })
    expect((await request(app, 'GET', `/api/households/${householdId}/members`, owner.cookie)).json().members
      .some((item: { fullName: string }) => item.fullName === 'Child')).toBe(false)
    expect((await request(app, 'POST', `${base}/${requestId}/approve`, admin.cookie, { role: 'admin' })).statusCode).toBe(403)
    expect((await request(app, 'POST', `${base}/${requestId}/approve`, editor.cookie, { role: 'admin' })).statusCode).toBe(403)
    expect((await request(app, 'PATCH', `/api/households/${householdId}/members/${adminMemberId}/role`, editor.cookie,
      { role: 'admin' })).statusCode).toBe(403)
    expect((await request(app, 'PATCH', `/api/households/${householdId}/members/${adminMemberId}/role`, viewer.cookie,
      { role: 'admin' })).statusCode).toBe(403)
    expect((await request(app, 'POST', `/api/households/${householdId}/members/${requestId}/invitations`, owner.cookie, {})).statusCode).toBe(404)
    const approved = await request(app, 'POST', `${base}/${requestId}/approve`, owner.cookie, { role: 'editor' })
    expect(approved.statusCode).toBe(200)
    expect(approved.json().member).toMatchObject({ fullName: 'Child', plannedAccessRole: 'editor', linkedUserId: null })
    expect((await request(app, 'POST', `${base}/${requestId}/approve`, owner.cookie, {})).statusCode).toBe(409)
    const db = new Database(databasePath)
    expect((db.prepare("SELECT COUNT(*) AS count FROM household_members WHERE household_id=? AND full_name='Child'")
      .get(householdId) as { count: number }).count).toBe(1)
    expect((db.prepare('SELECT action FROM household_audit WHERE target_request_id=? ORDER BY created_at').all(requestId) as { action: string }[])
      .map(row => row.action)).toEqual(['request_submitted', 'request_approved'])
    db.close()
    expect((await request(app, 'PATCH', `/api/households/${householdId}/members/${adminMemberId}/role`, admin.cookie,
      { role: 'editor' })).statusCode).toBe(403)
  })

  it('rejects a request without creating a member and denies cross-household review', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'Owner')
    const other = await signup(app, 'Other')
    const householdId = await home(app, owner.cookie)
    const otherHomeId = await home(app, other.cookie)
    const base = `/api/households/${householdId}/member-requests`
    const proposal = await request(app, 'POST', base, owner.cookie, { fullName: 'Not joining', relationship: 'other' })
    const requestId = proposal.json().request.id as string
    expect((await request(app, 'POST', `${base}/${requestId}/approve`, other.cookie, {})).statusCode).toBe(404)
    expect((await request(app, 'POST', `/api/households/${otherHomeId}/member-requests/${requestId}/approve`, other.cookie, {})).statusCode).toBe(409)
    expect((await request(app, 'POST', `${base}/${requestId}/reject`, owner.cookie, {})).statusCode).toBe(204)
    expect((await request(app, 'POST', `${base}/${requestId}/reject`, owner.cookie, {})).statusCode).toBe(409)
    const db = new Database(databasePath)
    expect((db.prepare('SELECT COUNT(*) AS count FROM household_members WHERE full_name=?').get('Not joining') as { count: number }).count).toBe(0)
    expect((db.prepare("SELECT COUNT(*) AS count FROM household_audit WHERE target_request_id=? AND action='request_rejected'").get(requestId) as { count: number }).count).toBe(1)
    db.close()
  })

  it('allows the proposer to cancel a pending request and records the cancellation', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'Owner')
    const editor = await signup(app, 'Editor')
    const householdId = await home(app, owner.cookie)
    assign(databasePath, householdId, editor.id, 'Editor', 'editor')
    const base = `/api/households/${householdId}/member-requests`
    const submitted = await request(app, 'POST', base, editor.cookie, { fullName: 'Proposed', relationship: 'other' })
    expect(submitted.statusCode).toBe(201)
    const requestId = submitted.json().request.id as string
    expect((await request(app, 'POST', `${base}/${requestId}/cancel`, owner.cookie, {})).statusCode).toBe(409)
    expect((await request(app, 'POST', `${base}/${requestId}/cancel`, editor.cookie, {})).statusCode).toBe(204)
    expect((await request(app, 'POST', `${base}/${requestId}/approve`, owner.cookie, {})).statusCode).toBe(409)
    const db = new Database(databasePath)
    expect((db.prepare('SELECT status FROM household_member_requests WHERE id=?').get(requestId) as { status: string }).status).toBe('cancelled')
    expect((db.prepare("SELECT COUNT(*) AS count FROM household_audit WHERE target_request_id=? AND action='request_cancelled'").get(requestId) as { count: number }).count).toBe(1)
    db.close()
  })

  it('changes planned and active roles atomically, revokes old codes, and applies permissions immediately', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'Owner')
    const guest = await signup(app, 'Guest')
    const householdId = await home(app, owner.cookie)
    const memberId = await member(app, owner.cookie, householdId, 'Guest member')
    const rolePath = `/api/households/${householdId}/members/${memberId}/role`
    const invitePath = `/api/households/${householdId}/members/${memberId}/invitations`
    const first = await request(app, 'POST', invitePath, owner.cookie, {})
    expect(first.json().invitation.role).toBe('viewer')
    const changed = await request(app, 'PATCH', rolePath, owner.cookie, { role: 'editor' })
    expect(changed.json().member.plannedAccessRole).toBe('editor')
    expect((await request(app, 'POST', '/api/household-invitations/redeem', guest.cookie, { code: first.json().code })).statusCode).toBe(400)
    expect((await request(app, 'POST', invitePath, owner.cookie, { role: 'viewer' })).statusCode).toBe(409)
    const second = await request(app, 'POST', invitePath, owner.cookie, {})
    expect(second.json().invitation.role).toBe('editor')
    const db = new Database(databasePath)
    expect((db.prepare('SELECT status FROM household_invitations WHERE id=?').get(first.json().invitation.id) as { status: string }).status).toBe('revoked')
    db.close()
    const reopened = await buildApp({ databasePath, frontendOrigin: origin, secureCookie: false })
    apps.push(reopened)
    expect((await request(reopened, 'GET', `/api/households/${householdId}/members/${memberId}`, owner.cookie)).json().member.plannedAccessRole).toBe('editor')
    expect((await request(app, 'POST', '/api/household-invitations/redeem', guest.cookie, { code: second.json().code })).statusCode).toBe(200)
    const memberPath = `/api/households/${householdId}/members/${memberId}`
    expect((await request(app, 'PATCH', memberPath, guest.cookie, { fullName: 'Updated' })).statusCode).toBe(200)
    expect((await request(app, 'PATCH', rolePath, owner.cookie, { role: 'viewer' })).statusCode).toBe(200)
    expect((await request(app, 'PATCH', memberPath, guest.cookie, { fullName: 'Again' })).statusCode).toBe(403)
    expect((await request(app, 'PATCH', rolePath, guest.cookie, { role: 'admin' })).statusCode).toBe(403)
    const audit = new Database(databasePath)
    expect((audit.prepare('SELECT action,previous_role,new_role FROM household_audit WHERE target_member_id=? ORDER BY created_at').all(memberId) as { action: string; previous_role: string; new_role: string }[])
      .map(row => [row.action, row.previous_role, row.new_role])).toEqual([
        ['planned_role_changed', 'viewer', 'editor'], ['role_changed', 'editor', 'viewer'],
      ])
    audit.close()
  })
})
