import { afterEach, expect, it } from 'vitest'
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
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { openDatabase } from '../../db/connection'
import { verifySnapshot } from '../../db/sqlite-backups'
const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

it.each([9, 10])(
  'preserves populated records when upgrading from %s applied migrations',
  (count) => {
    const folder = mkdtempSync(join(tmpdir(), 'gox-bill-migration-'))
    folders.push(folder)
    const prior = join(folder, 'prior'),
      source = resolve('packages/db/migrations')
    mkdirSync(join(prior, 'meta'), { recursive: true })
    const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8'))
    writeFileSync(
      join(prior, 'meta/_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, count) }),
    )
    for (const entry of journal.entries.slice(0, count))
      copyFileSync(join(source, `${entry.tag}.sql`), join(prior, `${entry.tag}.sql`))
    const path = join(folder, 'existing.sqlite'),
      sqlite = new Database(path)
    sqlite.pragma('foreign_keys = ON')
    migrate(drizzle(sqlite), { migrationsFolder: prior })
    const owner = randomUUID(),
      home = randomUUID(),
      member = randomUUID(),
      debt = randomUUID(),
      payment = randomUUID(),
      now = new Date().toISOString()
    sqlite
      .prepare(
        'INSERT INTO users (id,full_name,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      )
      .run(owner, 'Existing Owner', 'owner@example.com', 'test-hash', now, now)
    sqlite
      .prepare(
        'INSERT INTO households (id,name,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?)',
      )
      .run(home, 'Existing household', owner, now, now)
    sqlite
      .prepare(
        'INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      )
      .run(randomUUID(), home, owner, 'owner', now, now)
    sqlite
      .prepare(
        'INSERT INTO household_members (id,household_id,linked_user_id,full_name,relationship,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(member, home, owner, 'Existing Owner', 'self', 'active', now, now)
    sqlite
      .prepare(
        'INSERT INTO debts (id,household_id,created_by_user_id,creditor_name,account_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(debt, home, owner, 'Existing fictional creditor', 'auto_loan', now, now)
    sqlite
      .prepare(
        'INSERT INTO debt_members (debt_id,household_id,household_member_id,responsibility,created_at) VALUES (?,?,?,?,?)',
      )
      .run(debt, home, member, 'primary', now)
    sqlite
      .prepare(
        'INSERT INTO debt_payments (id,household_id,debt_id,created_by_user_id,idempotency_key,amount_cents,payment_date,payment_status,payment_method,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        payment,
        home,
        debt,
        owner,
        randomUUID(),
        1000,
        '2026-10-01',
        'completed',
        'cash',
        now,
        now,
      )
    const bill = randomUUID(),
      period = randomUUID()
    if (count === 10) {
      sqlite
        .prepare(
          'INSERT INTO bills (id,household_id,created_by_user_id,name,category,kind,amount_type,amount_cents,frequency,next_due_date,auto_pay,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          bill,
          home,
          owner,
          'Existing bill',
          'Other',
          'recurring',
          'fixed',
          1000,
          'monthly',
          '2026-10-01',
          0,
          'active',
          now,
          now,
        )
      sqlite
        .prepare(
          'INSERT INTO bill_periods (id,household_id,bill_id,due_date,name,category,amount_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .run(period, home, bill, '2026-10-01', 'Existing bill', 'Other', 1000, now, now)
      sqlite
        .prepare(
          'INSERT INTO bill_payments (id,household_id,bill_id,period_id,created_by_user_id,idempotency_key,amount_cents,payment_date,method,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          randomUUID(),
          home,
          bill,
          period,
          owner,
          randomUUID(),
          500,
          '2026-10-01',
          'cash',
          'pending',
          now,
          now,
        )
    }
    const tables = [
      'users',
      'households',
      'household_members',
      'household_user_roles',
      'debts',
      'debt_members',
      'debt_payments',
    ]
    const original = tables.map((table) => sqlite.prepare(`SELECT * FROM ${table}`).all())
    sqlite.close()
    const upgraded = openDatabase(path)
    try {
      tables.forEach((table, index) =>
        expect(upgraded.sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual(original[index]),
      )
      if (count === 10) {
        expect(
          upgraded.sqlite
            .prepare('SELECT id,credit_cents,notes,billing_period FROM bill_periods')
            .get(),
        ).toEqual({ id: period, credit_cents: 0, notes: null, billing_period: '2026-10-01' })
        expect(upgraded.sqlite.prepare('SELECT period_id FROM bill_payments').get()).toEqual({
          period_id: period,
        })
      }
      expect(upgraded.sqlite.pragma('foreign_key_check')).toEqual([])
      expect(upgraded.sqlite.pragma('integrity_check', { simple: true })).toBe('ok')
      const backup = readdirSync(join(folder, 'backups')).find((name) => name.endsWith('.sqlite'))!
      expect(() => verifySnapshot(join(folder, 'backups', backup))).not.toThrow()
    } finally {
      upgraded.sqlite.close()
    }
  },
)
