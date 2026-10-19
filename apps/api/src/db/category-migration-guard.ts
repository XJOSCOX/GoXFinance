import type Database from 'better-sqlite3'
import { defaultFinancialCategories, normalizeCategoryName } from '@goxfinance/shared'

// SQLite's built-in lower() is ASCII-only. Fail safely on legacy ambiguities
// rather than create two IDs that our Unicode-aware catalog considers the same.
export function validateLegacyCategoryNames(sqlite: Database.Database) {
  const exists = (table: string) =>
    !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)
  const seen = new Map<string, { databaseKey: string; id?: string }>()
  function add(home: string, name: string, databaseKey: string, id?: string) {
    const key = JSON.stringify([home, normalizeCategoryName(name)])
    const previous = seen.get(key)
    if (
      previous &&
      ((id && previous.id && id !== previous.id) || previous.databaseKey !== databaseKey)
    )
      throw new Error(
        'Legacy category names require review before migration; the verified backup and original records were preserved.',
      )
    if (!previous || id) seen.set(key, { databaseKey, id })
  }
  if (exists('expense_categories')) {
    const rows = sqlite
      .prepare('SELECT id,household_id,name,lower(trim(name)) database_key FROM expense_categories')
      .all() as { id: string; household_id: string; name: string; database_key: string }[]
    for (const row of rows) add(row.household_id, row.name, row.database_key, row.id)
  }
  const homes = sqlite.prepare('SELECT id FROM households').all() as { id: string }[]
  for (const home of homes)
    for (const name of defaultFinancialCategories) add(home.id, name, name.toLowerCase())
  for (const table of ['bills', 'bill_periods']) {
    if (!exists(table)) continue
    if (
      !(sqlite.pragma(`table_info(${table})`) as { name: string }[]).some(
        (column) => column.name === 'category',
      )
    )
      continue
    const rows = sqlite
      .prepare(`SELECT household_id,category,lower(trim(category)) database_key FROM ${table}`)
      .all() as { household_id: string; category: string; database_key: string }[]
    for (const row of rows)
      add(
        row.household_id,
        row.category.trim() ? row.category : 'Other',
        row.database_key || 'other',
      )
  }
}
