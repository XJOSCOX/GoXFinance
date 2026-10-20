import { afterEach, expect, it } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { openDatabase } from '../../db/connection'
import {
  openSqlite,
  plaintext,
  hasPlaintextHeader,
  type DatabaseSecurity,
} from '../../db/encryption/sqlite-engine'
import { reserveNewFile } from '../../db/encryption/encrypted-copy'
import { verifySnapshot } from '../../db/sqlite-backups'
const folders: string[] = [],
  keys: Buffer[] = []
afterEach(() => {
  for (const key of keys.splice(0)) key.fill(0)
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})
it.each([false, true])(
  'adds bank tables without changing existing rows and verifies safety backup; encrypted=%s',
  (encrypted) => {
    const folder = mkdtempSync(join(tmpdir(), 'gox-bank-migration-'))
    folders.push(folder)
    const key = randomBytes(32)
    keys.push(key)
    const security: DatabaseSecurity = encrypted ? { mode: 'encrypted', key } : plaintext
    const path = join(folder, 'prior.sqlite'),
      prior = join(folder, 'migrations'),
      source = resolve('packages/db/migrations')
    mkdirSync(join(prior, 'meta'), { recursive: true })
    const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8')),
      entries = journal.entries.slice(0, 29)
    writeFileSync(join(prior, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }))
    for (const entry of entries)
      copyFileSync(join(source, entry.tag + '.sql'), join(prior, entry.tag + '.sql'))
    if (encrypted) reserveNewFile(path)
    const db = openSqlite(path, security, { create: true }),
      user = randomUUID(),
      home = randomUUID(),
      now = '2026-01-01T00:00:00Z'
    const snapshot = new Map<string, unknown>()
    try {
      migrate(drizzle(db), { migrationsFolder: prior })
      db.prepare(
        'INSERT INTO users(id,full_name,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      ).run(
        user,
        'Fictional migration owner',
        'budget-migration@example.test',
        'test-only',
        now,
        now,
      )
      db.prepare(
        'INSERT INTO households(id,name,created_by_user_id,created_at,updated_at) VALUES(?,?,?,?,?)',
      ).run(home, 'Fictional migration household', user, now, now)
      db.prepare(
        'INSERT INTO financial_goals(id,household_id,created_by_user_id,idempotency_key,created_at,updated_at,name,goal_type,target_cents,period,start_date,end_date,direction,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        randomUUID(),
        home,
        user,
        randomUUID(),
        now,
        now,
        'Fictional existing goal',
        'manual',
        12345,
        'monthly',
        '2026-01-01',
        '2026-01-31',
        'at_least',
        'active',
      )
      for (const { name } of db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='__drizzle_migrations'",
        )
        .all() as { name: string }[])
        snapshot.set(name, db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all())
    } finally {
      db.close()
    }
    const next = openDatabase(path, security)
    try {
      for (const [name, rows] of snapshot)
        expect(
          next.sqlite.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all(),
        ).toEqual(rows)
      for (const name of [
        'bank_accounts',
        'bank_account_members',
        'bank_balance_observations',
        'bank_connections',
        'bank_transactions',
        'bank_reconciliations',
        'bank_review_requests',
        'bank_refunds',
      ])
        expect(next.sqlite.prepare('SELECT * FROM ' + name).all()).toEqual([])
      expect(next.sqlite.pragma('foreign_key_check')).toEqual([])
      expect(next.sqlite.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      next.sqlite.close()
    }
    const backup = join(
      folder,
      'backups',
      readdirSync(join(folder, 'backups')).find((n) => n.endsWith('.sqlite'))!,
    )
    expect(() => verifySnapshot(backup, security)).not.toThrow()
    expect(hasPlaintextHeader(path)).toBe(!encrypted)
  },
)
