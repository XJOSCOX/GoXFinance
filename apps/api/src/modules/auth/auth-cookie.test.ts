import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app'
import { testUser, testRequest, testOrigin } from '../../testing/workspace'
const apps: FastifyInstance[] = [],
  folders: string[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})
it('isolates QA cookie reads and logout from the normal application cookie', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'gox-cookie-audit-'))
  folders.push(folder)
  const app = await buildApp({
    databasePath: join(folder, 'qa.sqlite'),
    frontendOrigin: testOrigin,
    secureCookie: false,
    sessionCookieName: 'goxfinance_qa_session',
  })
  apps.push(app)
  const user = await testUser(app, 'Owner')
  expect(user.cookie.startsWith('goxfinance_qa_session=')).toBe(true)
  expect((await testRequest(app, 'GET', '/api/auth/me', user.cookie)).statusCode).toBe(200)
  expect(
    (
      await testRequest(
        app,
        'GET',
        '/api/auth/me',
        user.cookie.replace('goxfinance_qa_session=', 'goxfinance_session='),
      )
    ).statusCode,
  ).toBe(401)
  const logout = await testRequest(app, 'POST', '/api/auth/logout', user.cookie, {}, testOrigin)
  expect(String(logout.headers['set-cookie'])).toMatch(/^goxfinance_qa_session=/)
  expect((await testRequest(app, 'GET', '/api/auth/me', user.cookie)).statusCode).toBe(401)
})
