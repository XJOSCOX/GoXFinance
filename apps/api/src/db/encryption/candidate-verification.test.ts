import { afterEach, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../../app'
import { testHome, testUser } from '../../testing/workspace'
import { createSnapshot } from '../sqlite-backups'
import { acquireDatabaseLease } from '../runtime-lease'
import { prepareEncryptedConversion } from './convert-database'
import { databaseFingerprint } from './database-fingerprint'
import { openSqlite, plaintext } from './sqlite-engine'
import { verifyPreparedCandidate } from './candidate-verification'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
it('verifies candidate, source, exact copies, API reopening and a session-invalidating disposable restore without exposing records', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gox-candidate-rehearsal-'))
  directories.push(directory)
  const sourcePath = join(directory, 'source.sqlite'),
    candidatePath = join(directory, 'candidate.sqlite'),
    encryptedRecoveryPath = join(directory, 'recovery.sqlite')
  const app = await buildApp({
    databasePath: sourcePath,
    frontendOrigin: 'http://localhost:1420',
    secureCookie: false,
  })
  try {
    const owner = await testUser(app, 'EncryptionOwner', 'http://localhost:1420')
    await testHome(app, owner.cookie, 'http://localhost:1420')
  } finally {
    await app.close()
  }
  const source = openSqlite(sourcePath, plaintext)
  source.exec(
    "CREATE TABLE fictional_finance(cents INTEGER, notes TEXT); INSERT INTO fictional_finance VALUES(-34218,'fictional-private-marker')",
  )
  const fingerprint = databaseFingerprint(source)
  const backup = createSnapshot(source, sourcePath, null, 'recovery')
  source.close()
  const manifestPath = join(directory, 'manifest.json'),
    reportPath = join(directory, 'report.json')
  writeFileSync(
    manifestPath,
    JSON.stringify({
      sourcePath,
      candidatePath,
      encryptedRecoveryPath,
      logicalFingerprint: fingerprint,
      safetyBackup: { path: join(directory, 'backups', backup.id + '.sqlite') },
    }),
  )
  const key = randomBytes(32),
    security = { mode: 'encrypted' as const, key }
  try {
    prepareEncryptedConversion(sourcePath, encryptedRecoveryPath, candidatePath, security)
    const report = await verifyPreparedCandidate(manifestPath, reportPath, security)
    expect(Object.values(report.stages).every((value) => value === 'PASS')).toBe(true)
    expect(report.cutoverPerformed).toBe(false)
    expect(report.tableCounts.sessions).toBeGreaterThan(0)
    const serialized = readFileSync(reportPath, 'utf8')
    expect(serialized).not.toContain('fictional-private-marker')
    expect(serialized).not.toContain(key.toString('hex'))
    const original = openSqlite(sourcePath, plaintext, { readonly: true }),
      candidate = openSqlite(candidatePath, security, { readonly: true })
    try {
      expect(databaseFingerprint(original)).toBe(fingerprint)
      expect(databaseFingerprint(candidate)).toBe(fingerprint)
    } finally {
      original.close()
      candidate.close()
    }
    const retainedReport = readFileSync(reportPath)
    await expect(verifyPreparedCandidate(manifestPath, reportPath, security)).rejects.toThrow()
    expect(readFileSync(reportPath)).toEqual(retainedReport)
    const release = acquireDatabaseLease(sourcePath)
    try {
      await expect(
        verifyPreparedCandidate(manifestPath, join(directory, 'blocked.json'), security),
      ).rejects.toThrow()
    } finally {
      release()
    }
    const changed = openSqlite(sourcePath, plaintext)
    changed.exec('UPDATE fictional_finance SET cents=1')
    changed.close()
    const failedPath = join(directory, 'failed.json')
    await expect(verifyPreparedCandidate(manifestPath, failedPath, security)).rejects.toThrow()
    const failed = JSON.parse(readFileSync(failedPath, 'utf8'))
    expect(failed.stages.source).toBe('FAIL')
    expect(failed.stages.candidateApiReopen).toBe('NOT_RUN')
  } finally {
    key.fill(0)
  }
}, 20000)

it('only omits session rows for explicit restore comparisons; financial changes still fail equality', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gox-session-fingerprint-'))
  directories.push(directory)
  const db = openSqlite(join(directory, 'fixture.sqlite'), plaintext)
  try {
    db.exec(
      "CREATE TABLE sessions(id TEXT);CREATE TABLE amounts(cents INTEGER);INSERT INTO sessions VALUES ('fictional');INSERT INTO amounts VALUES(100)",
    )
    const exact = databaseFingerprint(db),
      restorable = databaseFingerprint(db, { omitSessionRowsForRestore: true })
    db.exec('DELETE FROM sessions')
    expect(databaseFingerprint(db)).not.toBe(exact)
    expect(databaseFingerprint(db, { omitSessionRowsForRestore: true })).toBe(restorable)
    db.exec('UPDATE amounts SET cents=101')
    expect(databaseFingerprint(db, { omitSessionRowsForRestore: true })).not.toBe(restorable)
  } finally {
    db.close()
  }
})
