import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openDatabase } from '../connection'
import { reserveNewFile, validateEncryptedFile } from './encrypted-copy'
import { validateKey, type DatabaseSecurity } from './sqlite-engine'

export function initializeEncryptedDatabase(path: string, security: DatabaseSecurity) {
  validateKey(security)
  if (security.mode !== 'encrypted') throw new Error('Initialization requires encrypted mode')
  mkdirSync(dirname(path), { recursive: true })
  reserveNewFile(path)
  openDatabase(path, security, true).sqlite.close()
  validateEncryptedFile(path, security)
}
