import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function acquireDatabaseLease(databasePath: string) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const lock = `${databasePath}.runtime.lock`
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf8'))
    let running = true
    try { process.kill(pid, 0) } catch (error) { running = (error as NodeJS.ErrnoException).code !== 'ESRCH' }
    if (running) throw new Error('Another API process is using this database')
    unlinkSync(lock)
  }
  writeFileSync(lock, String(process.pid), { flag: 'wx' })
  return () => { if (existsSync(lock) && readFileSync(lock, 'utf8') === String(process.pid)) unlinkSync(lock) }
}
