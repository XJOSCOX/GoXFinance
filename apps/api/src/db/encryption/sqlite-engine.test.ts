import { afterEach, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import PlainDatabase from 'better-sqlite3'
import { openDatabase } from '../connection'
import { initializeEncryptedDatabase } from './initialize-database'
import { hasPlaintextHeader, openSqlite, securityFor, type DatabaseSecurity } from './sqlite-engine'

const folders: string[] = [],
  keys: Buffer[] = []
afterEach(() => {
  for (const key of keys.splice(0)) key.fill(0)
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gox-encryption-')),
    key = randomBytes(32)
  folders.push(dir)
  keys.push(key)
  return {
    dir,
    path: join(dir, 'encrypted.sqlite'),
    security: { mode: 'encrypted', key } as DatabaseSecurity,
  }
}

it('explicitly initializes SQLCipher-mode SQLite, applies Drizzle migrations and persists WAL writes without plaintext', () => {
  const f = fixture()
  initializeEncryptedDatabase(f.path, f.security)
  expect(hasPlaintextHeader(f.path)).toBe(false)
  const { sqlite } = openDatabase(f.path, f.security)
  const marker = 'fictional-sensitive-canary-2026'
  try {
    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
    sqlite.exec('CREATE TABLE encryption_probe(id TEXT PRIMARY KEY, cents INTEGER NOT NULL)')
    sqlite.prepare('INSERT INTO encryption_probe VALUES (?, ?)').run(marker, 34218)
    for (const path of [f.path, f.path + '-wal']) {
      expect(readFileSync(path).includes(Buffer.from(marker))).toBe(false)
    }
    const ordinary = new PlainDatabase(f.path, { readonly: true })
    try {
      expect(() => ordinary.prepare('SELECT * FROM encryption_probe').all()).toThrow()
    } finally {
      ordinary.close()
    }
    const retained = securityFor(sqlite)
    sqlite.close()
    if (retained.mode === 'encrypted') expect(retained.key.every((byte) => byte === 0)).toBe(true)
    const restarted = openSqlite(f.path, f.security)
    try {
      expect(
        restarted.prepare('SELECT cents FROM encryption_probe WHERE id=?').get(marker),
      ).toEqual({ cents: 34218 })
    } finally {
      restarted.close()
    }
  } finally {
    if (sqlite.open) sqlite.close()
  }
})

it('fails closed on absent, incorrect and missing keys, with no replacement or logged secrets', () => {
  const f = fixture(),
    missing = join(f.dir, 'missing.sqlite')
  const errorLog = vi.spyOn(console, 'error'),
    infoLog = vi.spyOn(console, 'info')
  expect(() => openDatabase(missing, f.security)).toThrow()
  expect(existsSync(missing)).toBe(false)
  initializeEncryptedDatabase(f.path, f.security)
  const bytes = readFileSync(f.path)
  expect(() => initializeEncryptedDatabase(f.path, f.security)).toThrow()
  expect(() => openDatabase(f.path)).toThrow()
  expect(() => openDatabase(f.path, { mode: 'encrypted', key: Buffer.alloc(0) })).toThrow()
  expect(() =>
    openDatabase(f.path, { mode: 'encrypted', key: undefined as unknown as Buffer }),
  ).toThrow()
  const wrong = randomBytes(32)
  try {
    let message = ''
    try {
      openDatabase(f.path, { mode: 'encrypted', key: wrong })
    } catch (error) {
      message = String(error)
    }
    expect(message).toContain('no fallback')
    expect(message).not.toContain(wrong.toString('hex'))
    expect(message).not.toContain(f.path)
  } finally {
    wrong.fill(0)
  }
  expect(readFileSync(f.path)).toEqual(bytes)
  expect(errorLog).not.toHaveBeenCalled()
  expect(infoLog).not.toHaveBeenCalled()
})

it('reopens persistent encrypted data in a fresh Node process with a reentered matching passphrase', () => {
  const f = fixture()
  initializeEncryptedDatabase(f.path, f.security)
  const db = openSqlite(f.path, f.security)
  db.exec('CREATE TABLE fictional(cents INTEGER);INSERT INTO fictional VALUES(14218)')
  db.close()
  if (f.security.mode !== 'encrypted') throw new Error('Expected keyed fixture')
  const script = `
    import {readFileSync} from 'node:fs';
    import {openDatabase} from './apps/api/src/db/connection.ts';
    const key=readFileSync(0);
    const connection=openDatabase(process.argv[1],{mode:'encrypted',key});
    key.fill(0);
    try { process.stdout.write(JSON.stringify(connection.sqlite.prepare('SELECT cents FROM fictional').get())); }
    finally { connection.sqlite.close(); }
  `
  const output = execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script, f.path],
    {
      input: Buffer.from(f.security.key),
      encoding: 'utf8',
      timeout: 10_000,
    },
  )
  expect(JSON.parse(output)).toEqual({ cents: 14218 })
  expect(output).not.toContain(f.security.key.toString('hex'))
})

it('refuses plaintext in encrypted mode and detects authenticated-page corruption', () => {
  const f = fixture(),
    ordinaryPath = join(f.dir, 'plain.sqlite')
  const plain = new PlainDatabase(ordinaryPath)
  plain.exec('CREATE TABLE fictional(id TEXT)')
  plain.close()
  const before = readFileSync(ordinaryPath)
  expect(() => openDatabase(ordinaryPath, f.security)).toThrow()
  expect(readFileSync(ordinaryPath)).toEqual(before)
  initializeEncryptedDatabase(f.path, f.security)
  const corrupt = readFileSync(f.path)
  corrupt[1024] ^= 0xff
  writeFileSync(f.path, corrupt)
  expect(() => openDatabase(f.path, f.security)).toThrow()
  expect(readFileSync(f.path)).toEqual(corrupt)
})

it('encrypted API startup without a local unlock terminal exits without creating a replacement database', () => {
  const f = fixture()
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'apps/api/src/server.ts'], {
    env: { ...process.env, DATABASE_ENCRYPTION: 'encrypted', DATABASE_FILE: f.path },
    encoding: 'utf8',
    timeout: 10_000,
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Encrypted database unlock/startup failed')
  expect(existsSync(f.path)).toBe(false)
})
