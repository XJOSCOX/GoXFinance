import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from '../../../../packages/db/src/schema'
import { createSnapshot, migrationHashes } from './sqlite-backups'

export function openDatabase(path: string) {
  mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  const db = drizzle(sqlite, { schema })
  const financial = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='debts'").get()
  const applied = financial ? (sqlite.prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations').get() as { count: number }).count : 0
  if (financial && applied < migrationHashes().length) createSnapshot(sqlite, path, null, 'migration')
  migrate(db, { migrationsFolder: resolve(process.cwd(), 'packages/db/migrations') })
  return { db, sqlite }
}

export type DatabaseConnection = ReturnType<typeof openDatabase>['db']
