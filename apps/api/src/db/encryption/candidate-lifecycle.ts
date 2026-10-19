import { dirname, join } from 'node:path'
import { buildApp } from '../../app'
import {
  createSnapshot,
  queueRestore,
  restoreQueuedSnapshot,
  verifySnapshot,
} from '../sqlite-backups'
import { databaseFingerprint } from './database-fingerprint'
import { encryptedCopy } from './encrypted-copy'
import { openSqlite, type DatabaseSecurity } from './sqlite-engine'

/** Reopen the actual application twice, without real logins, writes, or network listeners. */
export async function verifyApiReopen(path: string, security: DatabaseSecurity) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const app = await buildApp({
      databasePath: path,
      databaseSecurity: security,
      frontendOrigin: 'http://localhost:1420',
      secureCookie: false,
    })
    try {
      await app.ready()
      const response = await app.inject({ method: 'GET', url: '/api/auth/me' })
      if (response.statusCode !== 401) throw new Error('Anonymous session check failed')
    } finally {
      await app.close()
    }
  }
}

/** All restore mutations are confined to a newly created, disposable encrypted copy. */
export async function rehearseCandidateRestore(
  candidatePath: string,
  directory: string,
  security: DatabaseSecurity,
  originalWithoutSessions: string,
  ownerId: string,
) {
  const restoredPath = join(directory, 'restore-rehearsal.sqlite')
  const candidate = openSqlite(candidatePath, security, { readonly: true })
  let backupPath: string
  try {
    const backup = createSnapshot(candidate, candidatePath, ownerId, 'recovery')
    backupPath = join(dirname(candidatePath), 'backups', backup.id + '.sqlite')
    const snapshot = openSqlite(backupPath, security, { readonly: true })
    try {
      if (databaseFingerprint(snapshot) !== databaseFingerprint(candidate))
        throw new Error('Backup comparison failed')
      encryptedCopy(snapshot, restoredPath, security)
    } finally {
      snapshot.close()
    }
  } finally {
    candidate.close()
  }
  const current = openSqlite(restoredPath, security)
  let restoreBackup: ReturnType<typeof createSnapshot>
  try {
    restoreBackup = createSnapshot(current, restoredPath, ownerId, 'recovery')
  } finally {
    current.close()
  }
  queueRestore(restoredPath, restoreBackup.id, ownerId, security)
  if (!(await restoreQueuedSnapshot(restoredPath, security)))
    throw new Error('Restore was not performed')
  verifySnapshot(restoredPath, security)
  const restored = openSqlite(restoredPath, security, { readonly: true })
  try {
    if (
      databaseFingerprint(restored, { omitSessionRowsForRestore: true }) !== originalWithoutSessions
    )
      throw new Error('Restored records differ')
    if (
      (restored.prepare('SELECT COUNT(*) count FROM sessions').get() as { count: number }).count !==
      0
    )
      throw new Error('Restored sessions were not invalidated')
  } finally {
    restored.close()
  }
  await verifyApiReopen(restoredPath, security)
  return { backupPath, restoredPath }
}
