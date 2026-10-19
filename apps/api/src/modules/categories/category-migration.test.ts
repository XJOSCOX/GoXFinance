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
import { verifySnapshot } from '../../db/sqlite-backups'
import {
  hasPlaintextHeader,
  openSqlite,
  plaintext,
  type DatabaseSecurity,
} from '../../db/encryption/sqlite-engine'
import { reserveNewFile } from '../../db/encryption/encrypted-copy'

const folders: string[] = [],
  keys: Buffer[] = []
afterEach(() => {
  for (const key of keys.splice(0)) key.fill(0)
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
  [false, 'unicode'],
  [true, 'unicode'],
])(
  'safely maps legacy labels and preserves IDs, splits and amounts with a verified backup (encrypted=%s, duplicate legacy names=%s)',
  (encrypted, duplicate) => {
    const folder = mkdtempSync(join(tmpdir(), 'gox-category-migration-'))
    folders.push(folder)
    const key = randomBytes(32)
    keys.push(key)
    const security: DatabaseSecurity = encrypted ? { mode: 'encrypted', key } : plaintext
    const source = resolve('packages/db/migrations'),
      prior = join(folder, 'prior'),
      path = join(folder, 'old.sqlite')
    mkdirSync(join(prior, 'meta'), { recursive: true })
    const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8'))
    const entries = journal.entries.slice(0, 15)
    writeFileSync(join(prior, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }))
    for (const entry of entries)
      copyFileSync(join(source, entry.tag + '.sql'), join(prior, entry.tag + '.sql'))
    if (encrypted) reserveNewFile(path)
    const sqlite = openSqlite(path, security, { create: true })
    const ids = Array.from({ length: 8 }, () => randomUUID()),
      [user, home, member, category, bill, period, debt, expense] = ids,
      now = '2026-01-01T00:00:00.000Z'
    try {
      migrate(drizzle(sqlite), { migrationsFolder: prior })
      sqlite
        .prepare(
          'INSERT INTO users(id,full_name,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        )
        .run(user, 'Fictional Owner', 'fiction@example.com', 'test-only-not-a-password', now, now)
      sqlite
        .prepare(
          'INSERT INTO households(id,name,created_by_user_id,created_at,updated_at) VALUES(?,?,?,?,?)',
        )
        .run(home, 'Example home', user, now, now)
      sqlite
        .prepare(
          'INSERT INTO household_members(id,household_id,linked_user_id,full_name,relationship,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(member, home, user, 'Fictional Owner', 'self', 'active', now, now)
      sqlite
        .prepare('INSERT INTO expense_categories(id,household_id,name,created_at) VALUES(?,?,?,?)')
        .run(category, home, duplicate === 'unicode' ? 'Énergie' : 'Health', now)
      sqlite
        .prepare(
          'INSERT INTO bills(id,household_id,created_by_user_id,name,category,kind,amount_type,amount_cents,next_due_date,auto_pay,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          bill,
          home,
          user,
          'Legacy bill',
          'Legacy Custom Label',
          'one_time',
          'fixed',
          12345,
          '2026-01-01',
          0,
          'active',
          now,
          now,
        )
      sqlite
        .prepare(
          'INSERT INTO bill_periods(id,household_id,bill_id,name,category,billing_period,due_date,amount_cents,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          period,
          home,
          bill,
          'Older bill',
          'Historical Label',
          '2026-01',
          '2026-01-01',
          54321,
          now,
          now,
        )
      sqlite
        .prepare(
          'INSERT INTO debts(id,household_id,created_by_user_id,creditor_name,account_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(debt, home, user, 'Example lender', 'credit_card', now, now)
      sqlite
        .prepare(
          'INSERT INTO expenses(id,household_id,responsible_member_id,created_by_user_id,description,amount_cents,transaction_date,payment_method,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          expense,
          home,
          member,
          user,
          'Historical purchase',
          10000,
          '2026-01-01',
          'cash',
          randomUUID(),
          now,
          now,
        )
      sqlite
        .prepare(
          'INSERT INTO expense_category_allocations(expense_id,household_id,category_id,amount_cents) VALUES(?,?,?,?)',
        )
        .run(expense, home, category, 10000)
      if (duplicate)
        sqlite
          .prepare(
            'INSERT INTO expense_categories(id,household_id,name,created_at) VALUES(?,?,?,?)',
          )
          .run(randomUUID(), home, duplicate === 'unicode' ? 'énergie' : 'HEALTH', now)
    } finally {
      sqlite.close()
    }
    if (duplicate) {
      expect(() => openDatabase(path, security)).toThrow()
      const unchanged = openSqlite(path, security, { readonly: true })
      try {
        expect(unchanged.prepare('SELECT count(*) count FROM __drizzle_migrations').get()).toEqual({
          count: 15,
        })
        expect(unchanged.prepare('SELECT count(*) count FROM expense_categories').get()).toEqual({
          count: 2,
        })
        expect(unchanged.prepare('SELECT category FROM bill_periods').get()).toEqual({
          category: 'Historical Label',
        })
      } finally {
        unchanged.close()
      }
      const backup = join(
        folder,
        'backups',
        readdirSync(join(folder, 'backups')).find((file) => file.endsWith('.sqlite'))!,
      )
      expect(() => verifySnapshot(backup, security)).not.toThrow()
      return
    }
    const upgraded = openDatabase(path, security)
    try {
      const mapped = upgraded.sqlite
        .prepare('SELECT id,category_id,category,amount_cents FROM bills WHERE id=?')
        .get(bill) as { category_id: string }
      const oldPeriod = upgraded.sqlite
        .prepare('SELECT category_id,category,amount_cents FROM bill_periods WHERE id=?')
        .get(period) as { category_id: string }
      expect(mapped).toMatchObject({
        id: bill,
        category: 'Legacy Custom Label',
        amount_cents: 12345,
      })
      expect(oldPeriod).toMatchObject({ category: 'Historical Label', amount_cents: 54321 })
      expect(mapped.category_id).not.toBe(oldPeriod.category_id)
      expect(
        upgraded.sqlite.prepare('SELECT name FROM expense_categories WHERE id=?').get(category),
      ).toEqual({ name: 'Health' })
      expect(
        upgraded.sqlite
          .prepare('SELECT category_id,amount_cents FROM expense_category_allocations')
          .all(),
      ).toEqual([{ category_id: category, amount_cents: 10000 }])
      expect(upgraded.sqlite.prepare('SELECT category_id FROM debts WHERE id=?').get(debt)).toEqual(
        { category_id: null },
      )
      expect(upgraded.sqlite.pragma('foreign_key_check')).toEqual([])
      expect(upgraded.sqlite.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      upgraded.sqlite.close()
    }
    const backup = join(
      folder,
      'backups',
      readdirSync(join(folder, 'backups')).find((file) => file.endsWith('.sqlite'))!,
    )
    expect(() => verifySnapshot(backup, security)).not.toThrow()
    expect(hasPlaintextHeader(backup)).toBe(!encrypted)
    const original = openSqlite(backup, security, { readonly: true })
    try {
      expect(original.prepare('SELECT count(*) count FROM __drizzle_migrations').get()).toEqual({
        count: 15,
      })
      expect(original.prepare('SELECT category FROM bill_periods').get()).toEqual({
        category: 'Historical Label',
      })
    } finally {
      original.close()
    }
  },
  15000,
)
