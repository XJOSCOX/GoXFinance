import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'

const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"'
const encode = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? { integer: item.toString() } : item,
  )

/** Logical equality includes every schema object and row, independent of physical page order. */
export function databaseFingerprint(db: Database.Database) {
  const hash = createHash('sha256')
  const schema = db
    .prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')
    .all()
  hash.update(encode(schema))
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[]
  for (const { name } of tables) {
    hash.update(name)
    const rows = db
      .prepare(`SELECT * FROM ${quote(name)}`)
      .safeIntegers()
      .all()
      .map((row) => createHash('sha256').update(encode(row)).digest('hex'))
      .sort()
    for (const row of rows) hash.update(row)
  }
  hash.update(String(db.pragma('user_version', { simple: true })))
  hash.update(String(db.pragma('application_id', { simple: true })))
  return hash.digest('hex')
}
