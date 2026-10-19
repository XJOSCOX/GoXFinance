import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { acquireDatabaseLease } from '../runtime-lease'
import { migrationHashes, verifySnapshot } from '../sqlite-backups'
import { databaseFingerprint } from './database-fingerprint'
import { rehearseCandidateRestore, verifyApiReopen } from './candidate-lifecycle'
import { hasPlaintextHeader, openSqlite, plaintext, type DatabaseSecurity } from './sqlite-engine'

const manifestSchema = z.object({
  sourcePath: z.string(),
  candidatePath: z.string(),
  encryptedRecoveryPath: z.string(),
  logicalFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  safetyBackup: z.object({ path: z.string() }),
})
const stageNames = [
  'source',
  'safetyBackup',
  'encryptedRecovery',
  'candidate',
  'ordinaryReaderRejection',
  'wrongPassphraseRejection',
  'candidateApiReopen',
  'encryptedBackupAndRestore',
  'sourceUnchanged',
] as const

/** Terminal-only offline verification. Never changes runtime configuration or the source records. */
export async function verifyPreparedCandidate(
  manifestPath: string,
  reportPath: string,
  security: DatabaseSecurity,
) {
  if (security.mode !== 'encrypted') throw new Error('An encrypted candidate and key are required')
  if (existsSync(reportPath))
    throw new Error('Verification report already exists; choose a new path')
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')))
  const paths = [
    manifest.sourcePath,
    manifest.candidatePath,
    manifest.encryptedRecoveryPath,
    manifest.safetyBackup.path,
  ]
  if (new Set(paths.map((p) => resolve(p).toLowerCase())).size !== paths.length)
    throw new Error('Files must be separate')
  if (paths.some((p) => resolve(p).toLowerCase() === resolve(reportPath).toLowerCase()))
    throw new Error('Report cannot replace a database')
  const releaseSource = acquireDatabaseLease(manifest.sourcePath)
  let releaseCandidate: (() => void) | undefined
  const report = {
    createdAt: new Date().toISOString(),
    cutoverPerformed: false,
    sourcePath: manifest.sourcePath,
    candidatePath: manifest.candidatePath,
    stages: Object.fromEntries(stageNames.map((name) => [name, 'NOT_RUN'])) as Record<
      (typeof stageNames)[number],
      string
    >,
    tableCounts: {} as Record<string, number>,
    logicalFingerprint: manifest.logicalFingerprint,
    rehearsal: null as null | { backupPath: string; restoredPath: string },
    apiTestScope:
      'Two in-process Fastify startup/close cycles; no production listener or credential use.',
    restoreSessionBehavior: 'Only the disposable restored copy has sessions invalidated.',
  }
  let stage: (typeof stageNames)[number] = 'source'
  function compare(path: string, mode: DatabaseSecurity) {
    verifySnapshot(path, mode)
    const db = openSqlite(path, mode, { readonly: true })
    try {
      if (databaseFingerprint(db) !== manifest.logicalFingerprint)
        throw new Error('Logical comparison failed')
    } finally {
      db.close()
    }
  }
  try {
    releaseCandidate = acquireDatabaseLease(manifest.candidatePath)
    if (!hasPlaintextHeader(manifest.sourcePath))
      throw new Error('Source already encrypted; do not repeat plaintext preparation')
    compare(manifest.sourcePath, plaintext)
    const source = openSqlite(manifest.sourcePath, plaintext, { readonly: true })
    let ownerId: string, withoutSessions: string
    try {
      const tables = source
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[]
      report.tableCounts = Object.fromEntries(
        tables.map(({ name }) => [
          name,
          (
            source
              .prepare('SELECT COUNT(*) count FROM "' + name.replaceAll('"', '""') + '"')
              .get() as { count: number }
          ).count,
        ]),
      )
      if (report.tableCounts.__drizzle_migrations !== migrationHashes().length)
        throw new Error('Source must already have current migrations')
      ownerId =
        (
          source.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get() as
            { id: string } | undefined
        )?.id ?? randomUUID()
      withoutSessions = databaseFingerprint(source, { omitSessionRowsForRestore: true })
    } finally {
      source.close()
    }
    report.stages[stage] = 'PASS'
    stage = 'safetyBackup'
    compare(manifest.safetyBackup.path, plaintext)
    report.stages[stage] = 'PASS'
    stage = 'encryptedRecovery'
    compare(manifest.encryptedRecoveryPath, security)
    report.stages[stage] = 'PASS'
    stage = 'candidate'
    compare(manifest.candidatePath, security)
    report.stages[stage] = 'PASS'
    stage = 'ordinaryReaderRejection'
    let rejected = false
    try {
      const db = openSqlite(manifest.candidatePath, plaintext, { readonly: true })
      db.close()
    } catch {
      rejected = true
    }
    if (!rejected) throw new Error('Ordinary reader unexpectedly accepted candidate')
    report.stages[stage] = 'PASS'
    stage = 'wrongPassphraseRejection'
    rejected = false
    const wrong = randomBytes(32)
    try {
      const db = openSqlite(
        manifest.candidatePath,
        { mode: 'encrypted', key: wrong },
        { readonly: true },
      )
      db.close()
    } catch {
      rejected = true
    } finally {
      wrong.fill(0)
    }
    if (!rejected) throw new Error('Wrong key unexpectedly accepted')
    report.stages[stage] = 'PASS'
    stage = 'candidateApiReopen'
    await verifyApiReopen(manifest.candidatePath, security)
    compare(manifest.candidatePath, security)
    report.stages[stage] = 'PASS'
    stage = 'encryptedBackupAndRestore'
    const rehearsalDirectory = join(
      dirname(resolve(reportPath)),
      'restore-rehearsal-' + randomUUID(),
    )
    mkdirSync(rehearsalDirectory)
    report.rehearsal = await rehearseCandidateRestore(
      manifest.candidatePath,
      rehearsalDirectory,
      security,
      withoutSessions,
      ownerId,
    )
    compare(manifest.candidatePath, security)
    report.stages[stage] = 'PASS'
    stage = 'sourceUnchanged'
    compare(manifest.sourcePath, plaintext)
    report.stages[stage] = 'PASS'
    return report
  } catch {
    report.stages[stage] = 'FAIL'
    throw new Error(
      'Candidate verification stopped; inspect the local report. No production cutover was performed.',
    )
  } finally {
    try {
      writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
    } finally {
      releaseCandidate?.()
      releaseSource()
    }
  }
}
