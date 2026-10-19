import { afterEach, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  existingApiReady,
  localWebsite,
  portOpen,
  signInEndpointReady,
  websiteReady,
} from './local-services'

const servers: Server[] = [],
  directories: string[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
it('only opens local HTTP origins without credentials, paths or injected query strings', () => {
  expect(localWebsite('http://localhost:1420')).toEqual({
    url: 'http://localhost:1420',
    host: 'localhost',
    port: 1420,
  })
  expect(localWebsite('http://[::1]:1420').host).toBe('::1')
  for (const url of [
    'https://localhost:1420',
    'http://example.com',
    'http://user:secret@localhost',
    'http://localhost/?command=x',
    'http://localhost/path',
  ])
    expect(() => localWebsite(url)).toThrow()
})
it('recognizes only a live configured API lease and the expected unauthenticated endpoint', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/api/auth/me') {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'Sign in required' }))
    } else {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('<title>GoXFinance</title>')
    }
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port,
    origin = `http://127.0.0.1:${port}`
  const directory = mkdtempSync(join(tmpdir(), 'gox-launcher-'))
  directories.push(directory)
  const database = join(directory, 'fictional.sqlite')
  expect(await portOpen(port, '127.0.0.1')).toBe(true)
  expect(await signInEndpointReady(origin)).toBe(true)
  expect(await websiteReady(origin)).toBe(true)
  expect(await existingApiReady(database, origin)).toBe(false)
  writeFileSync(database + '.runtime.lock', String(process.pid))
  expect(await existingApiReady(database, origin)).toBe(true)
  writeFileSync(database + '.runtime.lock', 'not-a-pid')
  expect(await existingApiReady(database, origin)).toBe(false)
})
it('rejects unrelated occupied services', async () => {
  const server = createServer((_request, response) => response.end('Another application'))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port,
    origin = `http://127.0.0.1:${port}`
  expect(await portOpen(port, '127.0.0.1')).toBe(true)
  expect(await signInEndpointReady(origin)).toBe(false)
  expect(await websiteReady(origin)).toBe(false)
})
