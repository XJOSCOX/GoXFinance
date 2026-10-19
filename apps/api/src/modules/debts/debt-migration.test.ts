import { afterEach, expect, it } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { openDatabase } from '../../db/connection'

const folders: string[] = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

it('adds debt tables to an existing household database without losing records', () => {
  const folder = mkdtempSync(join(tmpdir(), 'goxfinance-debt-migration-'))
  folders.push(folder)
  const prior = join(folder, 'prior')
  mkdirSync(join(prior, 'meta'), { recursive: true })
  const source = resolve(process.cwd(), 'packages/db/migrations')
  const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8'))
  writeFileSync(join(prior, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 5) }))
  for (const entry of journal.entries.slice(0, 5)) copyFileSync(join(source, `${entry.tag}.sql`), join(prior, `${entry.tag}.sql`))
  const path = join(folder, 'existing.sqlite')
  const sqlite = new Database(path)
  sqlite.pragma('foreign_keys = ON')
  migrate(drizzle(sqlite), { migrationsFolder: prior })
  const userId = randomUUID(), householdId = randomUUID(), memberId = randomUUID(), now = new Date().toISOString()
  sqlite.prepare('INSERT INTO users (id,full_name,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run(userId, 'Existing user', 'existing@example.com', 'hash', now, now)
  sqlite.prepare('INSERT INTO households (id,name,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run(householdId, 'Existing home', userId, now, now)
  sqlite.prepare('INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), householdId, userId, 'owner', now, now)
  sqlite.prepare('INSERT INTO household_members (id,household_id,linked_user_id,full_name,relationship,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(memberId, householdId, userId, 'Existing user', 'self', 'active', now, now)
  sqlite.close()

  const upgraded = openDatabase(path)
  expect((upgraded.sqlite.prepare('SELECT name FROM households WHERE id=?').get(householdId) as { name: string }).name).toBe('Existing home')
  expect((upgraded.sqlite.prepare('SELECT id FROM household_members WHERE id=?').get(memberId) as { id: string }).id).toBe(memberId)
  expect((upgraded.sqlite.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='debts'").get() as { count: number }).count).toBe(1)
  expect(upgraded.sqlite.pragma('foreign_key_check')).toEqual([])
  upgraded.sqlite.close()
})
