import type Database from 'better-sqlite3'
import { closeSync, fsyncSync, lstatSync, openSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import {
  checkIntegrity,
  hasPlaintextHeader,
  openSqlite,
  validateKey,
  type DatabaseSecurity,
} from './sqlite-engine'

export function reserveNewFile(path: string) {
  // wx refuses existing files, including symlinks. Never truncate a user's destination.
  closeSync(openSync(path, 'wx', 0o600))
}
export function validateEncryptedFile(path: string, security: DatabaseSecurity) {
  if (security.mode !== 'encrypted' || lstatSync(path).size === 0 || hasPlaintextHeader(path))
    throw new Error('Encrypted output validation failed')
  const reopened = openSqlite(path, security, { readonly: true })
  try {
    checkIntegrity(reopened)
  } finally {
    reopened.close()
  }
}
/** Engine-supported VACUUM INTO URI conversion. Keys are bound values, never SQL literals. */
export function encryptedCopy(
  source: Database.Database,
  target: string,
  security: DatabaseSecurity,
) {
  validateKey(security)
  if (security.mode !== 'encrypted') throw new Error('An encryption key is required for this copy')
  reserveNewFile(target)
  try {
    const uri = pathToFileURL(resolve(target))
    uri.searchParams.set('cipher', 'sqlcipher')
    uri.searchParams.set('legacy', '0')
    uri.searchParams.set('kdf_iter', '256000')
    uri.searchParams.set('hmac_use', '1')
    uri.searchParams.set('hmac_algorithm', '2')
    uri.searchParams.set('kdf_algorithm', '2')
    uri.searchParams.set('plaintext_header_size', '0')
    uri.searchParams.set('hexkey', security.key.toString('hex'))
    source.prepare('VACUUM INTO ?').run(uri.href)
    uri.searchParams.delete('hexkey')
    const fd = openSync(target, 'r+')
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    validateEncryptedFile(target, security)
  } catch {
    // Keep any incomplete encrypted output for inspection; never retry as plaintext.
    throw new Error('Encrypted copy failed; source retained and cutover not performed')
  }
}
