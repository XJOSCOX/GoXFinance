import { afterEach, it, expect } from 'vitest'
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
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
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
  'adds copy tracking without rebuilding existing financial tables and verifies pre-migration backup; encrypted=%s',
  (encrypted) => {
    const folder = mkdtempSync(join(tmpdir(), 'gox-trading-migration-'))
    folders.push(folder)
    const key = randomBytes(32)
    keys.push(key)
    const security: DatabaseSecurity = encrypted ? { mode: 'encrypted', key } : plaintext
    const path = join(folder, 'prior.sqlite'),
      prior = join(folder, 'migrations'),
      source = resolve('packages/db/migrations')
    mkdirSync(join(prior, 'meta'), { recursive: true })
    const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8')),
      entries = journal.entries.slice(0, 17)
    writeFileSync(join(prior, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }))
    for (const entry of entries)
      copyFileSync(join(source, entry.tag + '.sql'), join(prior, entry.tag + '.sql'))
    if (encrypted) reserveNewFile(path)
    const sqlite = openSqlite(path, security, { create: true }),
      user = randomUUID(),
      home = randomUUID(),
      member = randomUUID(),
      account = randomUUID(),
      goal = randomUUID(),
      contribution = randomUUID(),
      now = '2026-01-01T00:00:00Z'
    try {
      migrate(drizzle(sqlite), { migrationsFolder: prior })
      sqlite
        .prepare(
          'INSERT INTO users(id,full_name,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        )
        .run(user, 'Fictional owner', 'migration@example.com', 'test-only', now, now)
      sqlite
        .prepare(
          'INSERT INTO households(id,name,created_by_user_id,created_at,updated_at) VALUES(?,?,?,?,?)',
        )
        .run(home, 'Fictional household', user, now, now)
      sqlite
        .prepare(
          'INSERT INTO household_members(id,household_id,linked_user_id,full_name,relationship,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(member, home, user, 'Fictional owner', 'self', 'active', now, now)
      sqlite
        .prepare(
          'INSERT INTO trading_accounts(id,household_id,created_by_user_id,idempotency_key,created_at,updated_at,responsible_member_id,provider,nickname,stage,xfa_path,status,timezone,session_start) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          account,
          home,
          user,
          randomUUID(),
          now,
          now,
          member,
          'Topstep',
          'Existing fictional account',
          'xfa',
          'standard',
          'active',
          'America/Chicago',
          '18:00',
        )
      sqlite
        .prepare(
          'INSERT INTO financial_goals(id,household_id,created_by_user_id,idempotency_key,created_at,updated_at,name,goal_type,target_cents,period,start_date,end_date,responsible_member_id,direction,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          goal,
          home,
          user,
          randomUUID(),
          now,
          now,
          'Existing manual goal',
          'savings',
          50000,
          'monthly',
          '2026-01-01',
          '2026-01-31',
          member,
          'at_least',
          'active',
        )
      sqlite
        .prepare(
          'INSERT INTO goal_contributions(id,household_id,created_by_user_id,idempotency_key,created_at,updated_at,goal_id,amount_cents,date,notes) VALUES(?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          contribution,
          home,
          user,
          randomUUID(),
          now,
          now,
          goal,
          500,
          '2026-01-01',
          'Fictional contribution',
        )
    } finally {
      sqlite.close()
    }
    const migrated = openDatabase(path, security)
    try {
      expect(
        migrated.sqlite
          .prepare('SELECT id,nickname,reported_balance_cents FROM trading_accounts')
          .get(),
      ).toEqual({
        id: account,
        nickname: 'Existing fictional account',
        reported_balance_cents: null,
      })
      expect(
        migrated.sqlite.prepare('SELECT id,target_cents,copy_group_id FROM financial_goals').get(),
      ).toEqual({ id: goal, target_cents: 50000, copy_group_id: null })
      expect(
        migrated.sqlite.prepare('SELECT id,amount_cents FROM goal_contributions').get(),
      ).toEqual({ id: contribution, amount_cents: 500 })
      expect(migrated.sqlite.pragma('foreign_key_check')).toEqual([])
      expect(migrated.sqlite.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      migrated.sqlite.close()
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
