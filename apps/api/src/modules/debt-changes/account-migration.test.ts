import { expect, it } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { openDatabase } from '../../db/connection'

it('widens account request constraints without losing old requests, audits, payments or sessions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'goxfinance-account-migration-'))
  let sqlite: Database.Database | undefined
  try {
    const source = resolve('packages/db/migrations'), prior = join(directory, 'prior'), path = join(directory, 'old.sqlite')
    mkdirSync(join(prior, 'meta'), { recursive: true })
    const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8'))
    const entries = journal.entries.slice(0, 8)
    writeFileSync(join(prior, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }))
    for (const entry of entries) copyFileSync(join(source, `${entry.tag}.sql`), join(prior, `${entry.tag}.sql`))
    sqlite = new Database(path)
    sqlite.pragma('foreign_keys = ON')
    migrate(drizzle(sqlite), { migrationsFolder: prior })
    const user = randomUUID(), home = randomUUID(), debt = randomUUID(), member = randomUUID(), payment = randomUUID(), now = new Date().toISOString()
    sqlite.prepare('INSERT INTO users (id,full_name,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .run(user, 'Fictional migration user', 'migration@example.com', 'test-hash', now, now)
    sqlite.prepare('INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)')
      .run(randomUUID(), user, 'fictional-session-hash', Date.now() + 60000, now)
    sqlite.prepare('INSERT INTO households (id,name,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?)').run(home, 'Test home', user, now, now)
    sqlite.prepare('INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(randomUUID(), home, user, 'owner', now, now)
    sqlite.prepare('INSERT INTO household_members (id,household_id,linked_user_id,full_name,relationship,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(member, home, user, 'Test owner', 'self', 'active', now, now)
    sqlite.prepare('INSERT INTO debts (id,household_id,created_by_user_id,creditor_name,account_type,current_balance_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(debt, home, user, 'Test debt', 'credit_card', 100000, now, now)
    sqlite.prepare('INSERT INTO debt_members (debt_id,household_id,household_member_id,responsibility,created_at) VALUES (?,?,?,?,?)').run(debt, home, member, 'primary', now)
    sqlite.prepare('INSERT INTO debt_payments (id,household_id,debt_id,created_by_user_id,idempotency_key,amount_cents,payment_date,payment_status,payment_method,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(payment, home, debt, user, randomUUID(), 10000, '2026-01-10', 'completed', 'bank_transfer', now, now)
    // Exercise both pending and completed request/audit relationships during table recreation.
    for (const status of ['pending', 'approved']) {
      const id = randomUUID()
      sqlite.prepare('INSERT INTO debt_change_requests (id,household_id,debt_id,payment_id,proposed_by_user_id,action,payload_json,original_json,base_hash,reason,idempotency_key,active_target,status,reviewed_by_user_id,reviewed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, home, debt, payment, user, 'edit_payment', '{"amountCents":12000}', '{"amountCents":10000}', 'original-fingerprint', 'Test receipt', randomUUID(), status === 'pending' ? payment : null,
          status, status === 'approved' ? user : null, status === 'approved' ? now : null, now, now)
      sqlite.prepare('INSERT INTO debt_change_audit (id,request_id,actor_user_id,action,created_at) VALUES (?,?,?,?,?)').run(randomUUID(), id, user, 'submitted', now)
    }
    const tables = ['users', 'sessions', 'households', 'household_members', 'household_user_roles', 'debts', 'debt_members', 'debt_payments', 'debt_change_requests', 'debt_change_audit']
    const before = tables.map(table => sqlite!.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
    sqlite.close()
    sqlite = openDatabase(path).sqlite
    tables.forEach((table, index) => expect(sqlite!.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).toEqual(before[index]))
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
    expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE '__saved%' OR name LIKE '__new%'").all()).toEqual([])
  } finally { if (sqlite?.open) sqlite.close(); rmSync(directory, { recursive: true, force: true }) }
})
