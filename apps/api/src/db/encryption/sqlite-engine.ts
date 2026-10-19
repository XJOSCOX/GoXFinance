import PlainDatabase from 'better-sqlite3'
import { createRequire } from 'node:module'
import { closeSync, existsSync, lstatSync, openSync, readSync } from 'node:fs'

export type DatabaseSecurity = { mode: 'plaintext' } | { mode: 'encrypted'; key: Buffer }
export const plaintext: DatabaseSecurity = { mode: 'plaintext' }
type CipherDatabase = PlainDatabase.Database & { key(key: Buffer): number }
const contexts = new WeakMap<PlainDatabase.Database, DatabaseSecurity>()
const require = createRequire(import.meta.url)

// The maintained native package reads this non-secret option before native initialization.
function cipherConstructor() {
  process.env.SQLITE_USE_URI = '1'
  return require('better-sqlite3-multiple-ciphers') as typeof PlainDatabase
}
export function hasPlaintextHeader(path: string) {
  const fd = openSync(path, 'r'),
    header = Buffer.alloc(16)
  try {
    return readSync(fd, header, 0, 16, 0) === 16 && header.toString() === 'SQLite format 3\0'
  } finally {
    closeSync(fd)
  }
}
export function securityFor(db: PlainDatabase.Database): DatabaseSecurity {
  return contexts.get(db) ?? plaintext
}
export function validateKey(security: DatabaseSecurity) {
  if (
    security.mode === 'encrypted' &&
    (!Buffer.isBuffer(security.key) || security.key.length < 16 || security.key.length > 1024)
  ) {
    throw new Error('Database unlock requires a passphrase of 16–1024 UTF-8 bytes')
  }
}
export function checkIntegrity(db: PlainDatabase.Database) {
  if (
    db.pragma('integrity_check', { simple: true }) !== 'ok' ||
    (db.pragma('foreign_key_check') as unknown[]).length
  ) {
    throw new Error('Database integrity validation failed')
  }
}

/** No implicit encrypted creation or plaintext fallback. Initialization is a separate command. */
export function openSqlite(
  path: string,
  security: DatabaseSecurity = plaintext,
  options: {
    readonly?: boolean
    create?: boolean
    conversionSource?: boolean
  } = {},
) {
  validateKey(security)
  let db: PlainDatabase.Database | undefined
  try {
    if (security.mode === 'encrypted') {
      if (!existsSync(path))
        throw new Error('Encrypted database missing; use explicit initialization')
      if (
        lstatSync(path).isSymbolicLink() ||
        (!options.create && lstatSync(path).size === 0) ||
        hasPlaintextHeader(path)
      ) {
        throw new Error('Expected an encrypted database; explicit conversion is required')
      }
      const Cipher = cipherConstructor()
      db = new Cipher(path, { readonly: options.readonly ?? false, fileMustExist: true })
      db.pragma("cipher='sqlcipher'")
      db.pragma('legacy=0')
      db.pragma('kdf_iter=256000')
      db.pragma('hmac_use=1')
      db.pragma('hmac_check=1')
      db.pragma('hmac_algorithm=2')
      db.pragma('kdf_algorithm=2')
      db.pragma('plaintext_header_size=0')
      db.pragma('memory_security=ON')
      ;(db as CipherDatabase).key(security.key)
      db.prepare('SELECT count(*) FROM sqlite_master').get()
      if (
        String(db.pragma('cipher', { simple: true })) !== 'sqlcipher' ||
        String(db.pragma('hmac_use', { simple: true })) !== '1'
      ) {
        throw new Error('Encryption configuration unavailable')
      }
      checkIntegrity(db)
      const retainedKey = Buffer.from(security.key),
        close = db.close.bind(db),
        connection = db
      contexts.set(db, { mode: 'encrypted', key: retainedKey })
      db.close = () => {
        try {
          return close()
        } finally {
          retainedKey.fill(0)
          contexts.delete(connection)
        }
      }
    } else {
      // Conversion uses the encryption engine to read a plaintext source read-only.
      const Driver = options.conversionSource ? cipherConstructor() : PlainDatabase
      db = new Driver(path, {
        readonly: options.readonly ?? false,
        fileMustExist: options.readonly ?? false,
      })
      db.prepare('SELECT count(*) FROM sqlite_master').get()
    }
    db.pragma('temp_store=MEMORY')
    db.pragma('foreign_keys=ON')
    return db
  } catch {
    db?.close()
    // Native errors can contain filenames/URI bindings. Never forward them or attach causes.
    throw new Error(
      'Database could not be unlocked or validated. Check mode, file, key, and recovery instructions; no fallback was attempted.',
    )
  }
}
