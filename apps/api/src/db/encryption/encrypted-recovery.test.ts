import { afterEach, expect, it } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { openDatabase } from '../connection'
import {
  createSnapshot,
  queueRestore,
  restoreQueuedSnapshot,
  verifySnapshot,
  migrationHashes,
} from '../sqlite-backups'
import { initializeEncryptedDatabase } from './initialize-database'
import { encryptedCopy, reserveNewFile } from './encrypted-copy'
import { hasPlaintextHeader, openSqlite } from './sqlite-engine'

const folders: string[] = [],
  keys: Buffer[] = []
afterEach(() => {
  for (const key of keys.splice(0)) key.fill(0)
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gox-encrypted-recovery-')),
    key = randomBytes(32)
  folders.push(dir)
  keys.push(key)
  return { dir, path: join(dir, 'encrypted.sqlite'), security: { mode: 'encrypted' as const, key } }
}

it('encrypts automatic pre-migration snapshots and independently validates their earlier migration history', () => {
  const f = fixture(),
    oldMigrations = join(f.dir, 'migrations'),
    source = resolve('packages/db/migrations')
  mkdirSync(join(oldMigrations, 'meta'), { recursive: true })
  const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8'))
  writeFileSync(
    join(oldMigrations, 'meta/_journal.json'),
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, 14) }),
  )
  for (const entry of journal.entries.slice(0, 14))
    copyFileSync(join(source, `${entry.tag}.sql`), join(oldMigrations, `${entry.tag}.sql`))
  reserveNewFile(f.path)
  const initial = openSqlite(f.path, f.security, { create: true })
  try {
    migrate(drizzle(initial), { migrationsFolder: oldMigrations })
  } finally {
    initial.close()
  }
  const upgraded = openDatabase(f.path, f.security)
  try {
    expect(
      upgraded.sqlite.prepare('SELECT COUNT(*) count FROM __drizzle_migrations').get(),
    ).toEqual({ count: migrationHashes().length })
  } finally {
    upgraded.sqlite.close()
  }
  const snapshots = readdirSync(join(f.dir, 'backups')).filter((name) => name.endsWith('.sqlite'))
  expect(snapshots).toHaveLength(1)
  const snapshot = join(f.dir, 'backups', snapshots[0])
  expect(hasPlaintextHeader(snapshot)).toBe(false)
  expect(() => verifySnapshot(snapshot)).toThrow()
  verifySnapshot(snapshot, f.security)
  const prior = openSqlite(snapshot, f.security, { readonly: true })
  try {
    expect(prior.prepare('SELECT COUNT(*) count FROM __drizzle_migrations').get()).toEqual({
      count: 14,
    })
  } finally {
    prior.close()
  }
})

it.each(['before-cutover', 'after-retain', 'after-promote'])(
  'resumes encrypted restore interrupted %s; both original and encrypted recovery remain',
  async (interruption) => {
    const f = fixture()
    initializeEncryptedDatabase(f.path, f.security)
    const current = openDatabase(f.path, f.security).sqlite
    current.exec('CREATE TABLE fictional(cents INTEGER);INSERT INTO fictional VALUES(10000)')
    const snapshot = createSnapshot(current, f.path, 'fictional-owner', 'manual')
    current.exec('UPDATE fictional SET cents=25000')
    queueRestore(f.path, snapshot.id, 'fictional-owner', f.security)
    current.pragma('wal_checkpoint(TRUNCATE)')
    current.close()
    const plan = { backupId: snapshot.id, staged: randomUUID(), retained: randomUUID() }
    const stagePath = join(f.dir, `${plan.staged}.restore.sqlite`),
      retainedPath = join(f.dir, `${plan.retained}.retained.sqlite`)
    const manifest = join(f.dir, 'backups/restore.json')
    const backup = openSqlite(join(f.dir, 'backups', `${snapshot.id}.sqlite`), f.security, {
      readonly: true,
    })
    try {
      encryptedCopy(backup, stagePath, f.security)
    } finally {
      backup.close()
    }
    writeFileSync(manifest + '.plan', JSON.stringify(plan))
    if (interruption !== 'before-cutover') renameSync(f.path, retainedPath)
    if (interruption === 'after-promote') renameSync(stagePath, f.path)
    expect(await restoreQueuedSnapshot(f.path, f.security)).toBe(true)
    const restored = openDatabase(f.path, f.security).sqlite,
      retained = openSqlite(retainedPath, f.security)
    try {
      expect(restored.prepare('SELECT cents FROM fictional').get()).toEqual({ cents: 10000 })
      expect(retained.prepare('SELECT cents FROM fictional').get()).toEqual({ cents: 25000 })
    } finally {
      restored.close()
      retained.close()
    }
    expect(hasPlaintextHeader(retainedPath)).toBe(false)
    expect(existsSync(manifest)).toBe(false)
    expect(existsSync(manifest + '.plan')).toBe(false)
  },
)

it('rejects a corrupt encrypted backup before cutover and preserves existing data and the queued request', async () => {
  const f = fixture()
  initializeEncryptedDatabase(f.path, f.security)
  const current = openDatabase(f.path, f.security).sqlite
  const snapshot = createSnapshot(current, f.path, 'fictional-owner', 'manual')
  queueRestore(f.path, snapshot.id, 'fictional-owner', f.security)
  current.close()
  const before = readFileSync(f.path)
  const snapshotPath = join(f.dir, 'backups', `${snapshot.id}.sqlite`),
    corrupt = readFileSync(snapshotPath)
  corrupt[512] ^= 0xff
  writeFileSync(snapshotPath, corrupt)
  await expect(restoreQueuedSnapshot(f.path, f.security)).rejects.toThrow()
  expect(readFileSync(f.path)).toEqual(before)
  expect(existsSync(join(f.dir, 'backups/restore.json'))).toBe(true)
})
