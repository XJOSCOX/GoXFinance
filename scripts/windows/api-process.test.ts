import { expect, it, vi } from 'vitest'
import { createServer } from 'node:net'
import { mkdtempSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { initializeEncryptedDatabase } from '../../apps/api/src/db/encryption/initialize-database'
import { hasPlaintextHeader } from '../../apps/api/src/db/encryption/sqlite-engine'
import { startApi, stopApi } from './api-process'

it.each([false, true])(
  'waits for API readiness and closes the database through IPC; encrypted env unlock=%s',
  async (encrypted) => {
    const directory = mkdtempSync(join(tmpdir(), 'gox-launcher-api-')),
      database = join(directory, 'fictional.sqlite')
    const probe = createServer()
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const port = (probe.address() as { port: number }).port
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    const key = Buffer.from('Fictional launcher environment passphrase')
    if (encrypted) initializeEncryptedDatabase(database, { mode: 'encrypted', key })
    vi.stubEnv('DATABASE_PASSPHRASE', encrypted ? key.toString() : '')
    vi.stubEnv('DATABASE_ENCRYPTION', encrypted ? 'encrypted' : 'plaintext')
    vi.stubEnv('DATABASE_FILE', database)
    vi.stubEnv('API_PORT', String(port))
    vi.stubEnv('NODE_ENV', 'test')
    const { child, ready } = startApi(resolve('.'))
    try {
      await ready
      expect(Number(readFileSync(database + '.runtime.lock', 'utf8'))).toBe(child.pid)
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`)
      expect(response.status).toBe(401)
      await stopApi(child)
      expect(existsSync(database + '.runtime.lock')).toBe(false)
      expect(existsSync(database)).toBe(true)
      expect(hasPlaintextHeader(database)).toBe(!encrypted)
    } finally {
      await stopApi(child)
      key.fill(0)
      vi.unstubAllEnvs()
      rmSync(directory, { recursive: true, force: true })
    }
  },
  20000,
)
