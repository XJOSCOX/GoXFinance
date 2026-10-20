import { afterEach, expect } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { PlaidRuntime } from '../modules/banking/plaid/plaid.runtime'
import { buildApp } from '../app'
import { openSqlite, plaintext, type DatabaseSecurity } from '../db/encryption/sqlite-engine'
import { initializeEncryptedDatabase } from '../db/encryption/initialize-database'
import { testHome, testOrigin, testRequest, testUser } from './workspace'

const apps: FastifyInstance[] = [],
  folders: string[] = [],
  keys: Buffer[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const key of keys.splice(0)) key.fill(0)
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})
export async function setup(encrypted: boolean, plaid?: PlaidRuntime) {
  const folder = mkdtempSync(join(tmpdir(), 'gox-financial-'))
  folders.push(folder)
  const key = randomBytes(32)
  keys.push(key)
  const security: DatabaseSecurity = encrypted ? { mode: 'encrypted', key } : plaintext
  const path = join(folder, 'test.sqlite'),
    options = {
      plaid,
      databasePath: path,
      databaseSecurity: security,
      frontendOrigin: testOrigin,
      secureCookie: false,
    }
  if (encrypted) initializeEncryptedDatabase(path, security)
  const app = await buildApp(options)
  apps.push(app)
  const owner = await testUser(app, 'Owner'),
    { home, member } = await testHome(app, owner.cookie),
    base = `/api/households/${home}`
  const send = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    suffix: string,
    body?: object,
    cookie = owner.cookie,
  ) => testRequest(app, method, base + suffix, cookie, body)
  async function ok(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    suffix: string,
    body?: object,
    cookie = owner.cookie,
  ) {
    const result = await send(method, suffix, body, cookie)
    expect(result.statusCode, result.body).toBeLessThan(300)
    return result.json()
  }
  function grant(user: string, role: string) {
    const sqlite = openSqlite(path, security),
      id = randomUUID(),
      now = new Date().toISOString()
    try {
      sqlite
        .prepare(
          'INSERT INTO household_members(id,household_id,linked_user_id,full_name,relationship,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(id, home, user, role, 'other', 'active', now, now)
      sqlite
        .prepare(
          'INSERT INTO household_user_roles(id,household_id,user_id,role,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        )
        .run(randomUUID(), home, user, role, now, now)
    } finally {
      sqlite.close()
    }
    return id
  }
  return {
    app,
    options,
    owner,
    home,
    member,
    base,
    send,
    ok,
    grant,
    async restart() {
      await app.close()
      apps.splice(apps.indexOf(app), 1)
      const next = await buildApp(options)
      apps.push(next)
      return next
    },
  }
}
