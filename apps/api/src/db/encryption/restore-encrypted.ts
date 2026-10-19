import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { encryptedCopy } from './encrypted-copy'
import { openSqlite, type DatabaseSecurity } from './sqlite-engine'

type RestoreRequest = { backupId: string; requestedByUserId: string }
type Plan = { backupId: string; staged: string; retained: string }
const validId = (id: string) => /^[0-9a-f-]{36}$/.test(id)

/** Called only with the API stopped and its runtime lease held. Crash recovery is resumable. */
export function restoreEncrypted(
  databasePath: string,
  manifest: string,
  snapshot: string,
  security: DatabaseSecurity,
  snapshotCurrent: () => void,
  verify: (path: string) => void,
) {
  const request = JSON.parse(readFileSync(manifest, 'utf8')) as RestoreRequest
  const planPath = `${manifest}.plan`
  if (!existsSync(planPath)) {
    snapshotCurrent()
    const plan: Plan = { backupId: request.backupId, staged: randomUUID(), retained: randomUUID() }
    const source = openSqlite(snapshot, security, { readonly: true })
    try {
      encryptedCopy(source, join(dirname(databasePath), `${plan.staged}.restore.sqlite`), security)
    } finally {
      source.close()
    }
    verify(join(dirname(databasePath), `${plan.staged}.restore.sqlite`))
    const temporary = `${planPath}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify(plan), { flag: 'wx', mode: 0o600 })
    const fd = openSync(temporary, 'r+')
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(temporary, planPath)
  }
  const { backupId, staged, retained } = JSON.parse(readFileSync(planPath, 'utf8')) as Plan
  if (backupId !== request.backupId)
    throw new Error('Encrypted restore plan does not match request')
  if (!validId(staged) || !validId(retained)) throw new Error('Invalid encrypted restore plan')
  const stagePath = join(dirname(databasePath), `${staged}.restore.sqlite`)
  const retainedPath = join(dirname(databasePath), `${retained}.retained.sqlite`)
  if (!existsSync(retainedPath)) {
    verify(databasePath)
    verify(stagePath)
    renameSync(databasePath, retainedPath)
  }
  // If interrupted after retaining the old file, the next startup resumes here.
  if (!existsSync(databasePath)) {
    verify(stagePath)
    renameSync(stagePath, databasePath)
  }
  verify(databasePath)
  const restored = openSqlite(databasePath, security)
  try {
    restored.prepare('DELETE FROM sessions').run()
  } finally {
    restored.close()
  }
  verify(databasePath)
  unlinkSync(planPath)
  unlinkSync(manifest)
  // Both encrypted pre-restore copies remain; cleanup always requires a separate user decision.
}
