import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { acquireDatabaseLease } from '../runtime-lease'
import { encryptedCopy } from './encrypted-copy'
import { databaseFingerprint } from './database-fingerprint'
import { checkIntegrity, openSqlite, plaintext, type DatabaseSecurity } from './sqlite-engine'

/** Offline preparation only. Never renames, overwrites, deletes, or selects the original database. */
export function prepareEncryptedConversion(
  sourcePath: string,
  recoveryPath: string,
  destinationPath: string,
  targetSecurity: DatabaseSecurity,
  sourceSecurity: DatabaseSecurity = plaintext,
) {
  const paths = [sourcePath, recoveryPath, destinationPath].map((path) =>
    resolve(path).toLowerCase(),
  )
  if (new Set(paths).size !== 3)
    throw new Error('Source, recovery, and destination must be separate files')
  if (targetSecurity.mode !== 'encrypted') throw new Error('Encrypted conversion requires a key')
  const release = acquireDatabaseLease(sourcePath)
  try {
    for (const path of [recoveryPath, destinationPath])
      mkdirSync(dirname(path), { recursive: true })
    const source = openSqlite(sourcePath, sourceSecurity, {
      readonly: true,
      conversionSource: true,
    })
    try {
      checkIntegrity(source)
      const before = databaseFingerprint(source)
      encryptedCopy(source, recoveryPath, targetSecurity)
      const recovery = openSqlite(recoveryPath, targetSecurity, { readonly: true })
      try {
        if (databaseFingerprint(recovery) !== before)
          throw new Error('Recovery contents do not match source')
        encryptedCopy(recovery, destinationPath, targetSecurity)
      } finally {
        recovery.close()
      }
      const destination = openSqlite(destinationPath, targetSecurity, { readonly: true })
      try {
        if (databaseFingerprint(destination) !== before || databaseFingerprint(source) !== before) {
          throw new Error('Conversion verification failed; original retained')
        }
      } finally {
        destination.close()
      }
      return { verified: true as const, cutoverPerformed: false as const }
    } finally {
      source.close()
    }
  } finally {
    release()
  }
}
