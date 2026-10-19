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

it('adds payment tables without replacing existing household debt records', () => {
  const folder = mkdtempSync(join(tmpdir(), 'goxfinance-payment-migration-'))
  folders.push(folder)
  const prior = join(folder, 'prior')
  mkdirSync(join(prior, 'meta'), { recursive: true })
  const source = resolve(process.cwd(), 'packages/db/migrations')
  const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8'))
  writeFileSync(join(prior, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 6) }))
  for (const entry of journal.entries.slice(0, 6)) copyFileSync(join(source, `${entry.tag}.sql`), join(prior, `${entry.tag}.sql`))
  const path = join(folder, 'existing.sqlite')
  const sqlite = new Database(path)
  sqlite.pragma('foreign_keys = ON')
  migrate(drizzle(sqlite), { migrationsFolder: prior })
  const userId = randomUUID(), householdId = randomUUID(), debtId = randomUUID(), memberId = randomUUID(), now = new Date().toISOString()
  sqlite.prepare('INSERT INTO users (id,full_name,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run(userId, 'Existing user', 'existing@example.com', 'hash', now, now)
  sqlite.prepare('INSERT INTO households (id,name,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run(householdId, 'Existing home', userId, now, now)
  sqlite.prepare('INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), householdId, userId, 'owner', now, now)
  sqlite.prepare('INSERT INTO household_members (id,household_id,linked_user_id,full_name,relationship,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(memberId, householdId, userId, 'Existing user', 'self', 'active', now, now)
  sqlite.prepare('INSERT INTO debts (id,household_id,created_by_user_id,creditor_name,account_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(debtId, householdId, userId, 'Existing creditor', 'auto_loan', now, now)
  sqlite.prepare('INSERT INTO debt_members (debt_id,household_id,household_member_id,responsibility,created_at) VALUES (?,?,?,?,?)')
    .run(debtId, householdId, memberId, 'primary', now)
  sqlite.close()

  const upgraded = openDatabase(path)
  expect((upgraded.sqlite.prepare('SELECT creditor_name FROM debts WHERE id=?').get(debtId) as { creditor_name: string }).creditor_name)
    .toBe('Existing creditor')
  expect((upgraded.sqlite.prepare('SELECT household_member_id FROM debt_members WHERE debt_id=?').get(debtId) as { household_member_id: string }).household_member_id)
    .toBe(memberId)
  for (const table of ['debt_payments', 'debt_balance_history', 'debt_payment_audit']) {
    expect((upgraded.sqlite.prepare('SELECT COUNT(*) AS count FROM sqlite_master WHERE type=? AND name=?').get('table', table) as { count: number }).count).toBe(1)
  }
  expect(upgraded.sqlite.pragma('foreign_key_check')).toEqual([])
  upgraded.sqlite.close()
})
