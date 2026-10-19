import { afterEach, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../connection'
import { prepareEncryptedConversion } from './convert-database'
import { databaseFingerprint } from './database-fingerprint'
import { hasPlaintextHeader, openSqlite } from './sqlite-engine'
import { acquireDatabaseLease } from '../runtime-lease'

const folders: string[] = []
afterEach(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
})

it('converts committed WAL data read-only, verifies all logical values and preserves the original and recovery copy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gox-conversion-'))
  folders.push(dir)
  const path = join(dir, 'plain.sqlite'),
    destination = join(dir, 'candidate.sqlite'),
    recovery = join(dir, 'recovery.sqlite')
  const original = openDatabase(path).sqlite,
    key = randomBytes(32),
    security = { mode: 'encrypted' as const, key }
  // A live WAL connection stays open to demonstrate that committed pages are not omitted.
  original.exec(
    'CREATE TABLE fictional(cents INTEGER, missing_value TEXT);INSERT INTO fictional VALUES(34218,NULL)',
  )
  original.pragma('user_version=8')
  original.pragma('application_id=12345')
  const before = databaseFingerprint(original)
  try {
    expect(prepareEncryptedConversion(path, recovery, destination, security)).toEqual({
      verified: true,
      cutoverPerformed: false,
    })
    expect(hasPlaintextHeader(path)).toBe(true)
    expect(databaseFingerprint(original)).toBe(before)
    for (const target of [recovery, destination]) {
      expect(hasPlaintextHeader(target)).toBe(false)
      const copy = openSqlite(target, security)
      try {
        expect(databaseFingerprint(copy)).toBe(before)
        expect(copy.prepare('SELECT * FROM fictional').get()).toEqual({
          cents: 34218,
          missing_value: null,
        })
      } finally {
        copy.close()
      }
    }
  } finally {
    original.close()
    key.fill(0)
  }
})

it('retains source and verified recovery when candidate creation fails, refuses overwrite and concurrent API leases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gox-conversion-fail-'))
  folders.push(dir)
  const path = join(dir, 'plain.sqlite'),
    recovery = join(dir, 'recovery.sqlite'),
    candidate = join(dir, 'existing.sqlite')
  openDatabase(path).sqlite.close()
  const before = readFileSync(path),
    key = randomBytes(32),
    security = { mode: 'encrypted' as const, key }
  writeFileSync(candidate, 'do not overwrite')
  try {
    expect(() => prepareEncryptedConversion(path, recovery, path, security)).toThrow()
    const release = acquireDatabaseLease(path)
    try {
      expect(() => prepareEncryptedConversion(path, recovery, candidate, security)).toThrow()
    } finally {
      release()
    }
    expect(existsSync(recovery)).toBe(false)
    expect(() => prepareEncryptedConversion(path, recovery, candidate, security)).toThrow()
    expect(readFileSync(path)).toEqual(before)
    expect(readFileSync(candidate, 'utf8')).toBe('do not overwrite')
    const recovered = openSqlite(recovery, security)
    recovered.close()
  } finally {
    key.fill(0)
  }
})

it('rotates into a separate encrypted candidate; recovery requires the matching key, never an application password reset', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gox-key-recovery-'))
  folders.push(dir)
  const originalPath = join(dir, 'plain.sqlite'),
    oldPath = join(dir, 'old.sqlite'),
    newPath = join(dir, 'new.sqlite')
  openDatabase(originalPath).sqlite.close()
  const oldKey = randomBytes(32),
    newKey = randomBytes(32)
  const oldSecurity = { mode: 'encrypted' as const, key: oldKey },
    newSecurity = { mode: 'encrypted' as const, key: newKey }
  try {
    prepareEncryptedConversion(
      originalPath,
      join(dir, 'first-recovery.sqlite'),
      oldPath,
      oldSecurity,
    )
    const originalBytes = readFileSync(oldPath)
    prepareEncryptedConversion(
      oldPath,
      join(dir, 'rotated-recovery.sqlite'),
      newPath,
      newSecurity,
      oldSecurity,
    )
    expect(readFileSync(oldPath)).toEqual(originalBytes)
    expect(() => openSqlite(newPath, oldSecurity)).toThrow()
    expect(() => openSqlite(oldPath, newSecurity)).toThrow()
    openSqlite(newPath, newSecurity).close()
    openSqlite(oldPath, oldSecurity).close()
  } finally {
    oldKey.fill(0)
    newKey.fill(0)
  }
}, 15_000)
