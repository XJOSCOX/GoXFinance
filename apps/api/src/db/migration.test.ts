import { afterEach, expect, it } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { openDatabase } from './connection'

const folders: string[] = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

it('adds approval and access schema without replacing existing members or invitations', () => {
  const folder = mkdtempSync(join(tmpdir(), 'goxfinance-migration-'))
  folders.push(folder)
  const migrations = join(folder, 'old-migrations')
  mkdirSync(join(migrations, 'meta'), { recursive: true })
  const source = resolve(process.cwd(), 'packages/db/migrations')
  const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8'))
  writeFileSync(join(migrations, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 4) }))
  for (const entry of journal.entries.slice(0, 4)) copyFileSync(join(source, `${entry.tag}.sql`), join(migrations, `${entry.tag}.sql`))
  const path = join(folder, 'legacy.sqlite')
  const sqlite = new Database(path)
  sqlite.pragma('foreign_keys = ON')
  migrate(drizzle(sqlite), { migrationsFolder: migrations })
  const ownerId = randomUUID(), householdId = randomUUID(), ownerMemberId = randomUUID(), invitedMemberId = randomUUID()
  const invitationId = randomUUID(), now = new Date().toISOString()
  sqlite.prepare('INSERT INTO users (id,full_name,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run(ownerId, 'Existing Owner', 'existing@example.com', 'test-hash', now, now)
  sqlite.prepare('INSERT INTO households (id,name,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run(householdId, 'Existing home', ownerId, now, now)
  sqlite.prepare('INSERT INTO household_user_roles (id,household_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), householdId, ownerId, 'owner', now, now)
  const insertMember = sqlite.prepare('INSERT INTO household_members (id,household_id,linked_user_id,full_name,relationship,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
  insertMember.run(ownerMemberId, householdId, ownerId, 'Existing Owner', 'self', 'active', null, now, now)
  insertMember.run(invitedMemberId, householdId, null, 'Existing Invitee', 'spouse', 'active', null, now, now)
  sqlite.prepare(`INSERT INTO household_invitations
    (id,household_id,member_id,active_member_id,code_hash,role,status,created_by_user_id,created_at,updated_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(invitationId, householdId, invitedMemberId, invitedMemberId,
    'test-code-hash', 'admin', 'pending', ownerId, now, now, '2099-01-01T00:00:00.000Z')
  sqlite.close()

  const upgraded = openDatabase(path)
  const members = upgraded.sqlite.prepare('SELECT id,planned_access_role FROM household_members ORDER BY id').all() as { id: string; planned_access_role: string }[]
  expect(members).toContainEqual({ id: ownerMemberId, planned_access_role: 'viewer' })
  expect(members).toContainEqual({ id: invitedMemberId, planned_access_role: 'admin' })
  expect((upgraded.sqlite.prepare('SELECT status,role FROM household_invitations WHERE id=?').get(invitationId) as { status: string; role: string }))
    .toEqual({ status: 'pending', role: 'admin' })
  expect((upgraded.sqlite.prepare('SELECT role FROM household_user_roles WHERE household_id=? AND user_id=?').get(householdId, ownerId) as { role: string }).role).toBe('owner')
  expect((upgraded.sqlite.pragma('foreign_key_check') as unknown[])).toEqual([])
  upgraded.sqlite.close()
})
