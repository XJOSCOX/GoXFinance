import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import Database from 'better-sqlite3'
import { buildApp } from '../../app'
import { restoreQueuedSnapshot, verifySnapshot } from '../../db/sqlite-backups'
import { acquireDatabaseLease } from '../../db/runtime-lease'
import { testHome, testOrigin, testRequest as request, testRole, testUser } from '../../testing/workspace'

const apps: FastifyInstance[] = [], folders: string[] = []
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })
async function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'goxfinance-backup-')); folders.push(folder)
  const path = join(folder, 'test.sqlite'), app = await buildApp({ databasePath: path, frontendOrigin: testOrigin, secureCookie: false }); apps.push(app)
  const owner = await testUser(app, 'Owner'), home = await testHome(app, owner.cookie)
  return { app, folder, path, owner, ...home }
}

it('backs up WAL data, verifies integrity, requires confirmation, and restores after restart', async () => {
  const f = await setup()
  const snapshot = await request(f.app, 'POST', '/api/backups', f.owner.cookie, {})
  expect(snapshot.statusCode).toBe(201)
  const id = snapshot.json().backup.id as string
  expect(snapshot.body).not.toContain(f.path)
  const filename = join(f.folder, 'backups', `${id}.sqlite`)
  expect(() => verifySnapshot(filename)).not.toThrow()
  await request(f.app, 'POST', `/api/households/${f.home}/members`, f.owner.cookie, { fullName: 'Added after backup', relationship: 'other' })
  expect((await request(f.app, 'POST', `/api/backups/${id}/restore`, f.owner.cookie, {})).statusCode).toBe(400)
  expect((await request(f.app, 'POST', `/api/backups/${id}/restore`, f.owner.cookie, { confirmation: 'RESTORE DATABASE' })).statusCode).toBe(202)
  expect((await request(f.app, 'POST', `/api/households/${f.home}/members`, f.owner.cookie, { fullName: 'Blocked', relationship: 'other' })).statusCode).toBe(503)
  await f.app.close(); apps.splice(apps.indexOf(f.app), 1)
  const release = acquireDatabaseLease(f.path)
  expect(() => acquireDatabaseLease(f.path)).toThrow()
  try { expect(await restoreQueuedSnapshot(f.path)).toBe(true) } finally { release() }
  const restarted = await buildApp({ databasePath: f.path, frontendOrigin: testOrigin, secureCookie: false }); apps.push(restarted)
  expect((await request(restarted, 'GET', '/api/auth/me', f.owner.cookie)).statusCode).toBe(401)
  const login = await request(restarted, 'POST', '/api/auth/login', undefined, { email: 'owner@example.com', password: 'long test password' })
  const cookie = String(login.headers['set-cookie']).split(';')[0]
  expect((await request(restarted, 'GET', `/api/households/${f.home}/members`, cookie)).json().members).toHaveLength(1)
  expect((await request(restarted, 'GET', '/api/backups', cookie)).json().backups).toHaveLength(2)
})

it('denies non-owners, unrelated datasets, unknown identifiers and corrupt snapshots', async () => {
  const f = await setup(), viewer = await testUser(f.app, 'Viewer')
  testRole(f.path, f.home, viewer.id, 'viewer')
  expect((await request(f.app, 'GET', '/api/backups', viewer.cookie)).statusCode).toBe(403)
  expect((await request(f.app, 'POST', '/api/backups', undefined, {})).statusCode).toBe(401)
  const id = (await request(f.app, 'POST', '/api/backups', f.owner.cookie, {})).json().backup.id as string
  writeFileSync(join(f.folder, 'backups', `${id}.sqlite`), 'invalid database')
  expect((await request(f.app, 'POST', `/api/backups/${id}/restore`, f.owner.cookie, { confirmation: 'RESTORE DATABASE' })).statusCode).toBe(409)
  const incompatible = (await request(f.app, 'POST', '/api/backups', f.owner.cookie, {})).json().backup.id as string
  const snapshot = new Database(join(f.folder, 'backups', `${incompatible}.sqlite`))
  snapshot.prepare('INSERT INTO __drizzle_migrations (hash,created_at) VALUES (?,?)').run('unknown-migration', Date.now() + 1)
  snapshot.close()
  expect((await request(f.app, 'POST', `/api/backups/${incompatible}/restore`, f.owner.cookie, { confirmation: 'RESTORE DATABASE' })).statusCode).toBe(409)
  const outsider = await testUser(f.app, 'Outsider'); await testHome(f.app, outsider.cookie)
  expect((await request(f.app, 'POST', '/api/backups', f.owner.cookie, {})).statusCode).toBe(403)
})
