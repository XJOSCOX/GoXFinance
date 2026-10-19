import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app'

const origin = 'http://localhost:1420'
const folders: string[] = []
const apps: FastifyInstance[] = []

async function createApp(path?: string) {
  const folder = path ? undefined : mkdtempSync(join(tmpdir(), 'goxfinance-test-'))
  if (folder) folders.push(folder)
  const databasePath = path ?? join(folder!, 'accounts.sqlite')
  const app = await buildApp({ databasePath, frontendOrigin: origin, secureCookie: false })
  apps.push(app)
  return { app, databasePath }
}

function post(app: FastifyInstance, url: string, payload: object, cookie?: string) {
  return app.inject({ method: 'POST', url, payload, headers: { origin, 'x-goxfinance-request': '1', ...(cookie ? { cookie } : {}) } })
}

function sessionCookie(response: { headers: { 'set-cookie'?: string | string[] } }) {
  const header = response.headers['set-cookie']
  return (Array.isArray(header) ? header[0] : header ?? '').split(';')[0]
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('SQLite account and session API', () => {
  it('signs up, persists an Argon2id hash, and rejects duplicate normalized email', async () => {
    const { app, databasePath } = await createApp()
    const signup = await post(app, '/api/auth/signup', { fullName: 'Alex Example', email: ' ALEX@Example.com ', password: 'long unique password', confirmPassword: 'long unique password' })
    expect(signup.statusCode).toBe(201)
    expect(signup.json().user.email).toBe('alex@example.com')
    expect(signup.json().user.passwordHash).toBeUndefined()
    const db = new Database(databasePath)
    const record = db.prepare('SELECT password_hash, id FROM users WHERE email=?').get('alex@example.com') as { password_hash: string; id: string }
    expect(record.password_hash).toMatch(/^\$argon2id\$/)
    expect(record.password_hash).not.toContain('long unique password')
    expect(record.id).toMatch(/^[0-9a-f-]{36}$/)
    db.close()
    const duplicate = await post(app, '/api/auth/signup', { fullName: 'Other', email: 'alex@example.com', password: 'another long password', confirmPassword: 'another long password' })
    expect(duplicate.statusCode).toBe(409)
  })

  it('rejects incorrect passwords, persists sessions across API restarts, and invalidates logout', async () => {
    const { app, databasePath } = await createApp()
    await post(app, '/api/auth/signup', { fullName: 'Alex', email: 'alex@example.com', password: 'long unique password', confirmPassword: 'long unique password' })
    expect((await post(app, '/api/auth/login', { email: 'alex@example.com', password: 'incorrect password' })).statusCode).toBe(401)
    const login = await post(app, '/api/auth/login', { email: 'ALEX@example.com', password: 'long unique password' })
    expect(login.statusCode).toBe(200)
    const cookie = sessionCookie(login)
    expect(cookie).toContain('goxfinance_session=')
    const db = new Database(databasePath)
    const session = db.prepare('SELECT token_hash FROM sessions ORDER BY created_at DESC LIMIT 1').get() as { token_hash: string }
    expect(session.token_hash).not.toContain(cookie.split('=')[1])
    db.close()
    const restarted = await createApp(databasePath)
    const me = await restarted.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
    expect(me.json().user.fullName).toBe('Alex')
    expect((await post(restarted.app, '/api/auth/logout', {}, cookie)).statusCode).toBe(204)
    expect((await restarted.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401)
    const loginAgain = await post(restarted.app, '/api/auth/login', { email: 'alex@example.com', password: 'long unique password' })
    expect(loginAgain.statusCode).toBe(200)
    expect(loginAgain.json().user.fullName).toBe('Alex')
  })

  it('protects cross-user sessions and rejects cross-origin writes', async () => {
    const { app } = await createApp()
    const a = await post(app, '/api/auth/signup', { fullName: 'Alex', email: 'alex@example.com', password: 'long unique password', confirmPassword: 'long unique password' })
    const b = await post(app, '/api/auth/signup', { fullName: 'Blair', email: 'blair@example.com', password: 'another long password', confirmPassword: 'another long password' })
    const aCookie = sessionCookie(a)
    const bCookie = sessionCookie(b)
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: aCookie } })).json().user.fullName).toBe('Alex')
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: bCookie } })).json().user.fullName).toBe('Blair')
    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401)
    const attack = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin: 'https://another.example', cookie: aCookie } })
    expect(attack.statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: aCookie } })).statusCode).toBe(200)
  })

  it('expires sessions and limits repeated login attempts', async () => {
    const { app, databasePath } = await createApp()
    const signup = await post(app, '/api/auth/signup', { fullName: 'Alex', email: 'alex@example.com', password: 'long unique password', confirmPassword: 'long unique password' })
    const cookie = sessionCookie(signup)
    const db = new Database(databasePath)
    db.prepare('UPDATE sessions SET expires_at = 0').run()
    db.close()
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401)
    const attempts = []
    for (let count = 0; count < 6; count++) attempts.push(await post(app, '/api/auth/login', { email: 'alex@example.com', password: 'incorrect password' }))
    expect(attempts.slice(0, 5).every(response => response.statusCode === 401)).toBe(true)
    expect(attempts[5].statusCode).toBe(429)
  })
})
