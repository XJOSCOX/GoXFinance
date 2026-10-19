import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'

export const testOrigin = 'http://localhost:1420'
export function testRequest(app: FastifyInstance, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, cookie?: string, payload?: object, origin = testOrigin) {
  return app.inject({ method, url, ...(payload ? { payload } : {}), headers: { ...(cookie ? { cookie } : {}),
    ...(method === 'GET' ? {} : { origin, 'x-goxfinance-request': '1' }) } })
}
export async function testUser(app: FastifyInstance, name: string, origin = testOrigin) {
  const result = await testRequest(app, 'POST', '/api/auth/signup', undefined, { fullName: name, email: `${name.toLowerCase()}@example.com`,
    password: 'long test password', confirmPassword: 'long test password' }, origin)
  if (result.statusCode !== 201) throw new Error('Test signup failed')
  return { id: result.json().user.id as string, cookie: String(result.headers['set-cookie']).split(';')[0] }
}
export async function testHome(app: FastifyInstance, cookie: string, origin = testOrigin) {
  const home = (await testRequest(app, 'POST', '/api/households', cookie, { name: 'Test household' }, origin)).json().household.id as string
  const member = (await testRequest(app, 'GET', `/api/households/${home}/members`, cookie)).json().members[0].id as string
  return { home, member }
}
export function testRole(path: string, home: string, user: string, role: 'admin' | 'editor' | 'viewer') {
  const sqlite = new Database(path), id = randomUUID(), now = new Date().toISOString()
  sqlite.pragma('foreign_keys = ON')
  try {
    sqlite.prepare('INSERT INTO household_members (id,household_id,linked_user_id,full_name,relationship,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, home, user, role, 'other', 'active', now, now)
    sqlite.prepare('INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), home, user, role, now, now)
  } finally { sqlite.close() }
  return id
}
