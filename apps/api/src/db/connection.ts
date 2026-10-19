import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from '../../../../packages/db/src/schema'
import { createSnapshot, migrationHashes } from './sqlite-backups'
import { openSqlite, plaintext, type DatabaseSecurity } from './encryption/sqlite-engine'
import { validateLegacyCategoryNames } from './category-migration-guard'

export function openDatabase(path: string, security: DatabaseSecurity = plaintext, create = false) {
  mkdirSync(dirname(path), { recursive: true })
  const sqlite = openSqlite(path, security, { create })
  try {
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('journal_mode = WAL')
    const db = drizzle(sqlite, { schema })
    const financial = sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='debts'")
      .get()
    const applied = financial
      ? (
          sqlite.prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations').get() as {
            count: number
          }
        ).count
      : 0
    if (financial && applied < migrationHashes().length) {
      createSnapshot(sqlite, path, null, 'migration')
      if (applied < 16) validateLegacyCategoryNames(sqlite)
    }
    migrate(db, { migrationsFolder: resolve(process.cwd(), 'packages/db/migrations') })
    return { db, sqlite }
  } catch (error) {
    sqlite.close()
    throw error
  }
}

export type DatabaseConnection = ReturnType<typeof openDatabase>['db']
