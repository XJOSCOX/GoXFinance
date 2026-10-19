import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

type Backup = { id: string; createdAt: string; ownerUserId: string | null; kind: 'manual' | 'migration' | 'recovery' }
const folder = (path: string) => join(dirname(resolve(path)), 'backups')
const file = (path: string, id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid backup identifier')
  return join(folder(path), `${id}.sqlite`)
}
export function migrationHashes() {
  const root = resolve('packages/db/migrations')
  const journal = JSON.parse(readFileSync(join(root, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  return journal.entries.map(item => createHash('sha256').update(readFileSync(join(root, `${item.tag}.sql`))).digest('hex'))
}
function compatibleMigrationHashes() {
  const root = resolve('packages/db/migrations')
  const journal = JSON.parse(readFileSync(join(root, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  return journal.entries.map((entry, index) => {
    const sql = readFileSync(join(root, `${entry.tag}.sql`), 'utf8').replace(/\r\n/g, '\n')
    const hashes = [sql, sql.replace(/\n/g, '\r\n')].map(value => createHash('sha256').update(value).digest('hex'))
    // Released 0004 used mixed line endings before Git normalization; keep its recorded fingerprint compatible.
    if (index === 4) hashes.push('75a97d32daeb41d5fa7bf64a4d72d8965a16b175588b79c7b7348c4b795bc25f')
    return hashes
  })
}
export function verifySnapshot(path: string) {
  const source = new Database(path, { readonly: true, fileMustExist: true })
  try {
    if (source.pragma('integrity_check', { simple: true }) !== 'ok' || (source.pragma('foreign_key_check') as unknown[]).length) {
      throw new Error('Backup integrity check failed')
    }
    const versions = source.prepare('SELECT hash FROM __drizzle_migrations ORDER BY id').all() as { hash: string }[]
    const known = compatibleMigrationHashes()
    if (!versions.length || versions.length > known.length || versions.some((entry, index) => !known[index].includes(entry.hash))) {
      throw new Error('Backup schema is incompatible')
    }
  } finally { source.close() }
}
export function createSnapshot(sqlite: Database.Database, databasePath: string, ownerUserId: string | null, kind: Backup['kind']): Backup {
  mkdirSync(folder(databasePath), { recursive: true })
  const metadata: Backup = { id: randomUUID(), createdAt: new Date().toISOString(), ownerUserId, kind }
  const target = file(databasePath, metadata.id)
  // SQLite creates a consistent snapshot, including committed WAL pages.
  sqlite.prepare('VACUUM INTO ?').run(target)
  verifySnapshot(target)
  writeFileSync(join(folder(databasePath), `${metadata.id}.json`), JSON.stringify(metadata), { flag: 'wx', mode: 0o600 })
  return metadata
}
export function listSnapshots(databasePath: string, userId: string): Backup[] {
  if (!existsSync(folder(databasePath))) return []
  return readdirSync(folder(databasePath)).filter(name => /^[0-9a-f-]{36}\.json$/.test(name)).map(name =>
    JSON.parse(readFileSync(join(folder(databasePath), name), 'utf8')) as Backup)
    .filter(item => item.ownerUserId === userId && item.kind !== 'migration').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export const hasQueuedRestore = (path: string) => existsSync(join(folder(path), 'restore.json'))
export function queueRestore(databasePath: string, backupId: string, userId: string) {
  if (!listSnapshots(databasePath, userId).some(item => item.id === backupId)) throw new Error('Backup not found')
  verifySnapshot(file(databasePath, backupId))
  writeFileSync(join(folder(databasePath), 'restore.json'), JSON.stringify({ backupId, requestedByUserId: userId }), { flag: 'wx', mode: 0o600 })
}
export async function restoreQueuedSnapshot(databasePath: string) {
  const manifest = join(folder(databasePath), 'restore.json')
  if (!existsSync(manifest)) return false
  const request = JSON.parse(readFileSync(manifest, 'utf8')) as { backupId: string; requestedByUserId: string }
  const snapshot = file(databasePath, request.backupId)
  verifySnapshot(snapshot)
  const current = new Database(databasePath, { fileMustExist: true })
  try { createSnapshot(current, databasePath, request.requestedByUserId, 'recovery'); current.pragma('wal_checkpoint(TRUNCATE)') }
  finally { current.close() }
  const source = new Database(snapshot, { readonly: true })
  // SQLite's backup API restores into the closed app database, including WAL handling.
  try { await source.backup(databasePath) } finally { source.close() }
  verifySnapshot(databasePath)
  const restored = new Database(databasePath)
  try { restored.prepare('DELETE FROM sessions').run() } finally { restored.close() }
  unlinkSync(manifest)
  return true
}
