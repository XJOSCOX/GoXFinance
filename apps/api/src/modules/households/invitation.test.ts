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
  const folder = mkdtempSync(join(tmpdir(), 'goxfinance-invites-'))
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

async function signup(app: FastifyInstance, email: string, fullName: string, invitationCode?: string) {
  const response = await request(app, 'POST', '/api/auth/signup', undefined, {
    fullName, email, password: 'long unique password', confirmPassword: 'long unique password', invitationCode,
  })
  return { response, cookie: String(response.headers['set-cookie']).split(';')[0], userId: response.json().user?.id as string | undefined }
}

async function home(app: FastifyInstance, cookie: string) {
  const response = await request(app, 'POST', '/api/households', cookie, { name: 'Our home' })
  expect(response.statusCode).toBe(201)
  return response.json().household.id as string
}

async function member(app: FastifyInstance, cookie: string, householdId: string, name = 'Blair') {
  const response = await request(app, 'POST', `/api/households/${householdId}/members`, cookie,
    { fullName: name, relationship: 'spouse', notes: 'Owner entered note' })
  expect(response.statusCode).toBe(201)
  return response.json().member.id as string
}

async function invite(app: FastifyInstance, cookie: string, householdId: string, memberId: string, role = 'editor') {
  if (role !== 'viewer') {
    const planned = await request(app, 'PATCH', `/api/households/${householdId}/members/${memberId}/role`, cookie, { role })
    expect(planned.statusCode).toBe(200)
  }
  const response = await request(app, 'POST', `/api/households/${householdId}/members/${memberId}/invitations`, cookie, {})
  expect(response.statusCode).toBe(201)
  return { code: response.json().code as string, invitationId: response.json().invitation.id as string }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('household invitation lifecycle', () => {
  it('lets an owner issue a high-entropy code for a member and stores only its hash', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'owner@example.com', 'Owner')
    const householdId = await home(app, owner.cookie)
    const memberId = await member(app, owner.cookie, householdId)
    const { code, invitationId } = await invite(app, owner.cookie, householdId, memberId)
    const other = await signup(app, 'other@example.com', 'Other')
    const otherHouseholdId = await home(app, other.cookie)
    expect(code.length).toBeGreaterThanOrEqual(40)
    const db = new Database(databasePath)
    const row = db.prepare('SELECT * FROM household_invitations WHERE id=?').get(invitationId) as Record<string, string>
    expect(row.code_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(row.code_hash).not.toBe(code)
    expect(row.household_id).toBe(householdId)
    expect(row.member_id).toBe(memberId)
    expect(row.created_by_user_id).toBe(owner.userId)
    expect(row.role).toBe('editor')
    expect(new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()).toBe(7 * 86400000)
    expect(() => db.prepare(`INSERT INTO household_invitations
      (id,household_id,member_id,active_member_id,code_hash,role,status,created_by_user_id,created_at,updated_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), householdId, memberId, memberId, randomUUID(),
      'viewer', 'pending', owner.userId, row.created_at, row.created_at, row.expires_at)).toThrow()
    expect(() => db.prepare(`INSERT INTO household_invitations
      (id,household_id,member_id,code_hash,role,status,created_by_user_id,created_at,updated_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), otherHouseholdId, memberId, randomUUID(),
      'viewer', 'revoked', owner.userId, row.created_at, row.created_at, row.expires_at)).toThrow()
    db.close()
    const list = await request(app, 'GET', `/api/households/${householdId}/members`, owner.cookie)
    const listed = list.json().members.find((entry: { id: string }) => entry.id === memberId)
    expect(listed.invitation.id).toBe(invitationId)
    expect(JSON.stringify(list.json())).not.toContain(code)
  })

  it('atomically signs up an invited user without overwriting or duplicating the member', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'owner@example.com', 'Owner')
    const householdId = await home(app, owner.cookie)
    const memberId = await member(app, owner.cookie, householdId)
    const { code } = await invite(app, owner.cookie, householdId, memberId, 'viewer')
    const joined = await signup(app, 'blair@example.com', 'Different Signup Name', code)
    expect(joined.response.statusCode).toBe(201)
    const me = await request(app, 'GET', '/api/auth/me', joined.cookie)
    expect(me.json().user.fullName).toBe('Different Signup Name')
    const db = new Database(databasePath)
    const linked = db.prepare('SELECT id,linked_user_id,full_name,notes FROM household_members WHERE id=?').get(memberId) as Record<string, string>
    expect(linked).toMatchObject({ id: memberId, linked_user_id: joined.userId, full_name: 'Blair', notes: 'Owner entered note' })
    expect((db.prepare('SELECT count(*) AS n FROM household_members WHERE household_id=?').get(householdId) as { n: number }).n).toBe(2)
    const assigned = db.prepare('SELECT role FROM household_user_roles WHERE household_id=? AND user_id=?').get(householdId, joined.userId) as { role: string }
    expect(assigned.role).toBe('viewer')
    expect((db.prepare('SELECT status,redeemed_by_user_id FROM household_invitations').get() as Record<string, string>))
      .toMatchObject({ status: 'redeemed', redeemed_by_user_id: joined.userId })
    db.close()
    expect((await request(app, 'GET', '/api/households', joined.cookie)).json().households[0].id).toBe(householdId)
    const reused = await signup(app, 'second@example.com', 'Second', code)
    expect(reused.response.statusCode).toBe(400)
    expect(reused.response.json().error).toBe('Invitation could not be accepted')
  })

  it('rejects expired, revoked, and regenerated old codes with the same message', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'owner@example.com', 'Owner')
    const householdId = await home(app, owner.cookie)
    const memberId = await member(app, owner.cookie, householdId)
    const first = await invite(app, owner.cookie, householdId, memberId)
    const base = `/api/households/${householdId}/members/${memberId}/invitations/${first.invitationId}`
    const replaced = await request(app, 'POST', `${base}/regenerate`, owner.cookie, {})
    expect(replaced.statusCode).toBe(201)
    const secondCode = replaced.json().code as string
    const old = await request(app, 'POST', '/api/household-invitations/redeem', owner.cookie, { code: first.code })
    expect(old.statusCode).toBe(400)
    const secondId = replaced.json().invitation.id as string
    expect((await request(app, 'DELETE', `/api/households/${householdId}/members/${memberId}/invitations/${secondId}`, owner.cookie)).statusCode).toBe(204)
    const revoked = await request(app, 'POST', '/api/household-invitations/redeem', owner.cookie, { code: secondCode })
    expect(revoked.statusCode).toBe(400)
    const third = await invite(app, owner.cookie, householdId, memberId)
    const db = new Database(databasePath)
    db.prepare('UPDATE household_invitations SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z', third.invitationId)
    db.close()
    const expired = await request(app, 'POST', '/api/household-invitations/redeem', owner.cookie, { code: third.code })
    expect(expired.statusCode).toBe(400)
    const check = new Database(databasePath)
    expect((check.prepare('SELECT status FROM household_invitations WHERE id=?').get(third.invitationId) as { status: string }).status).toBe('expired')
    check.close()
    expect(old.json().error).toBe(revoked.json().error)
    expect(old.json().error).toBe(expired.json().error)
    const fourth = await invite(app, owner.cookie, householdId, memberId)
    expect((await request(app, 'DELETE', `/api/households/${householdId}/members/${memberId}`, owner.cookie)).statusCode).toBe(204)
    const disabled = await request(app, 'POST', '/api/household-invitations/redeem', owner.cookie, { code: fourth.code })
    expect(disabled.statusCode).toBe(400)
  })

  it('supports existing users and multiple households but rejects conflicting links', async () => {
    const { app } = await setup()
    const owner = await signup(app, 'owner@example.com', 'Owner')
    const existing = await signup(app, 'existing@example.com', 'Existing')
    const householdId = await home(app, owner.cookie)
    const ownHousehold = await home(app, existing.cookie)
    const firstMember = await member(app, owner.cookie, householdId)
    const first = await invite(app, owner.cookie, householdId, firstMember)
    const joined = await request(app, 'POST', '/api/household-invitations/redeem', existing.cookie, { code: first.code })
    expect(joined.statusCode).toBe(200)
    const ids = (await request(app, 'GET', '/api/households', existing.cookie)).json().households.map((row: { id: string }) => row.id)
    expect(ids).toContain(householdId)
    expect(ids).toContain(ownHousehold)
    const secondMember = await member(app, owner.cookie, householdId, 'Casey')
    const second = await invite(app, owner.cookie, householdId, secondMember)
    const conflict = await request(app, 'POST', '/api/household-invitations/redeem', existing.cookie, { code: second.code })
    expect(conflict.statusCode).toBe(400)
    expect(conflict.json().error).toBe('Invitation could not be accepted')
  })

  it('removes a linked member from one household while preserving their account, other home, and member history', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'owner@example.com', 'Owner')
    const guest = await signup(app, 'guest@example.com', 'Guest')
    const householdId = await home(app, owner.cookie)
    const guestHomeId = await home(app, guest.cookie)
    const memberId = await member(app, owner.cookie, householdId)
    const { code } = await invite(app, owner.cookie, householdId, memberId)
    expect((await request(app, 'POST', '/api/household-invitations/redeem', guest.cookie, { code })).statusCode).toBe(200)
    const url = `/api/households/${householdId}/members/${memberId}`
    expect((await request(app, 'DELETE', url, owner.cookie)).statusCode).toBe(204)
    expect((await request(app, 'GET', `/api/households/${householdId}`, guest.cookie)).statusCode).toBe(404)
    expect((await request(app, 'GET', '/api/auth/me', guest.cookie)).json().user.id).toBe(guest.userId)
    expect((await request(app, 'GET', '/api/households', guest.cookie)).json().households.map((item: { id: string }) => item.id)).toEqual([guestHomeId])
    expect((await request(app, 'GET', url, owner.cookie)).json().member).toMatchObject({ id: memberId, status: 'inactive', linkedUserId: null, accessRole: null })
    const db = new Database(databasePath)
    expect((db.prepare('SELECT COUNT(*) AS count FROM household_members WHERE id=?').get(memberId) as { count: number }).count).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS count FROM household_user_roles WHERE household_id=? AND user_id=?').get(householdId, guest.userId) as { count: number }).count).toBe(0)
    db.close()
    expect((await request(app, 'PATCH', url, owner.cookie, { status: 'active' })).statusCode).toBe(200)
    expect((await request(app, 'GET', `/api/households/${householdId}`, guest.cookie)).statusCode).toBe(404)
  })

  it('revokes a linked member through the status update path as well', async () => {
    const { app } = await setup()
    const owner = await signup(app, 'owner@example.com', 'Owner')
    const guest = await signup(app, 'guest@example.com', 'Guest')
    const householdId = await home(app, owner.cookie)
    const memberId = await member(app, owner.cookie, householdId)
    const { code } = await invite(app, owner.cookie, householdId, memberId)
    expect((await request(app, 'POST', '/api/household-invitations/redeem', guest.cookie, { code })).statusCode).toBe(200)
    const url = `/api/households/${householdId}/members/${memberId}`
    expect((await request(app, 'PATCH', url, owner.cookie, { status: 'inactive' })).statusCode).toBe(200)
    expect((await request(app, 'GET', url, guest.cookie)).statusCode).toBe(404)
    expect((await request(app, 'GET', url, owner.cookie)).json().member.linkedUserId).toBeNull()
  })

  it('blocks unauthorized issue and client-supplied privilege escalation', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'owner@example.com', 'Owner')
    const viewer = await signup(app, 'viewer@example.com', 'Viewer')
    const admin = await signup(app, 'admin@example.com', 'Admin')
    const householdId = await home(app, owner.cookie)
    const memberId = await member(app, owner.cookie, householdId)
    const db = new Database(databasePath)
    const now = new Date().toISOString()
    db.prepare('INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), householdId, viewer.userId, 'viewer', now, now)
    db.prepare('INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), householdId, admin.userId, 'admin', now, now)
    db.close()
    const url = `/api/households/${householdId}/members/${memberId}/invitations`
    expect((await request(app, 'POST', url, viewer.cookie, { role: 'editor' })).statusCode).toBe(403)
    expect((await request(app, 'POST', url, owner.cookie, { role: 'owner' })).statusCode).toBe(400)
    expect((await request(app, 'POST', url, admin.cookie, { role: 'viewer' })).statusCode).toBe(403)
    const issued = await invite(app, owner.cookie, householdId, memberId, 'viewer')
    const attacker = await signup(app, 'attacker@example.com', 'Attacker')
    const result = await request(app, 'POST', '/api/household-invitations/redeem', attacker.cookie,
      { code: issued.code, role: 'owner', householdId: randomUUID(), memberId: randomUUID() })
    expect(result.statusCode).toBe(400)
    const valid = await request(app, 'POST', '/api/household-invitations/redeem', attacker.cookie, { code: issued.code })
    expect(valid.statusCode).toBe(200)
    expect(valid.json().household.role).toBe('viewer')
  })

  it('allows only one concurrent redemption and rolls back failed signup/linking', async () => {
    const { app, databasePath } = await setup()
    const owner = await signup(app, 'owner@example.com', 'Owner')
    const householdId = await home(app, owner.cookie)
    const memberId = await member(app, owner.cookie, householdId)
    const first = await invite(app, owner.cookie, householdId, memberId)
    const [a, b] = await Promise.all([
      signup(app, 'a@example.com', 'A', first.code), signup(app, 'b@example.com', 'B', first.code),
    ])
    expect([a.response.statusCode, b.response.statusCode].sort()).toEqual([201, 400])
    const db = new Database(databasePath)
    const count = db.prepare('SELECT count(*) AS n FROM users WHERE email in (?,?)').get('a@example.com', 'b@example.com') as { n: number }
    expect(count.n).toBe(1)
    const secondMember = await member(app, owner.cookie, householdId, 'Casey')
    const second = await invite(app, owner.cookie, householdId, secondMember)
    db.exec("CREATE TRIGGER fail_role BEFORE INSERT ON household_user_roles WHEN NEW.user_id IN (SELECT id FROM users WHERE email = 'fail@example.com') BEGIN SELECT RAISE(ABORT, 'test rollback'); END")
    const failed = await signup(app, 'fail@example.com', 'Failed', second.code)
    expect(failed.response.statusCode).toBe(400)
    expect((db.prepare('SELECT count(*) AS n FROM users WHERE email=?').get('fail@example.com') as { n: number }).n).toBe(0)
    expect((db.prepare('SELECT linked_user_id FROM household_members WHERE id=?').get(secondMember) as { linked_user_id: string | null }).linked_user_id).toBeNull()
    expect((db.prepare('SELECT status FROM household_invitations WHERE id=?').get(second.invitationId) as { status: string }).status).toBe('pending')
    db.close()
  })
})
