import { backupSchema, emptyBackup, parseBackup, schemas, settingsSchema, householdSchema, type Backup, type Collection, type Household, type Settings } from './schema'
import type { ImportPolicy } from './sqliteStorage'

// Browser preview is intentionally transient. Desktop financial data only lives in SQLite.
let current: Backup = emptyBackup()
export async function readAll() { return structuredClone(current) }
export async function saveRecord(key: Collection, record: Backup[Collection][number]) {
  const parsed = schemas[key].parse(record)
  const rows = current[key] as unknown as { id: string }[]
  current = backupSchema.parse({ ...current, [key]: [...rows.filter(row => row.id !== parsed.id), parsed] })
}
export async function deleteRecord(key: Collection, id: string) {
  current = backupSchema.parse({ ...current, [key]: (current[key] as { id: string }[]).filter(row => row.id !== id) })
}
export async function saveSettings(value: Settings) { current = { ...current, settings: settingsSchema.parse(value) } }
export async function saveHousehold(value: Household) { current = { ...current, household: householdSchema.parse(value) } }
export async function previewBackup(value: unknown) {
  const imported = parseBackup(value)
  const conflicts = (Object.keys(schemas) as Collection[]).flatMap(key => (imported[key] as { id: string; name: string }[]).filter(row => (current[key] as { id: string }[]).some(old => old.id === row.id)).map(row => ({ collection: key, id: row.id, name: row.name })))
  return { total: (Object.keys(schemas) as Collection[]).reduce((n, key) => n + imported[key].length, 0), conflicts, settingsConflict: JSON.stringify(imported.settings) !== JSON.stringify(current.settings), householdConflict: imported.household.name !== current.household.name }
}
export async function mergeBackup(value: unknown, policy: ImportPolicy = 'skip') {
  const imported = parseBackup(value), preview = await previewBackup(imported)
  if (policy === 'review' && (preview.conflicts.length || preview.settingsConflict || preview.householdConflict)) throw new Error('Review conflicts before importing')
  const next: Record<string, unknown> = { ...current }
  for (const key of Object.keys(schemas) as Collection[]) {
    const existing = current[key] as { id: string }[], incoming = imported[key] as { id: string }[]
    next[key] = policy === 'update' ? [...existing.filter(row => !incoming.some(item => item.id === row.id)), ...incoming] : [...existing, ...incoming.filter(row => !existing.some(item => item.id === row.id))]
  }
  if (policy === 'update') { next.settings = imported.settings; next.household = imported.household }
  current = backupSchema.parse(next)
  return { imported: preview.total, conflicts: preview.conflicts.length, policy, verified: true }
}
