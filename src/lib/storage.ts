import { isTauri } from '@tauri-apps/api/core'
import type { Backup, Collection, Settings } from './schema'

/** The UI depends on this port, never on SQL, Dexie, or a database location. */
export interface FinanceStore {
  readAll(): Promise<Backup>
  saveRecord(key: Collection, record: Backup[Collection][number]): Promise<void>
  deleteRecord(key: Collection, id: string): Promise<void>
  saveSettings(value: Settings): Promise<void>
  mergeBackup(value: unknown): Promise<unknown>
}

let selected: Promise<FinanceStore> | undefined
async function store(): Promise<FinanceStore> {
  if (!selected) selected = isTauri() ? import('./sqliteStorage').then(module => module as FinanceStore) : import('./legacyIndexedDb').then(module => ({ ...module, mergeBackup: module.replaceAll }) as FinanceStore)
  return selected
}
export const readAll = async () => (await store()).readAll()
export const saveRecord = async (key: Collection, record: Backup[Collection][number]) => (await store()).saveRecord(key, record)
export const deleteRecord = async (key: Collection, id: string) => (await store()).deleteRecord(key, id)
export const saveSettings = async (value: Settings) => (await store()).saveSettings(value)
export const mergeBackup = async (value: unknown) => (await store()).mergeBackup(value)
/** Kept for existing callers; desktop imports are safe UUID merges, not destructive replacements. */
export const replaceAll = mergeBackup
