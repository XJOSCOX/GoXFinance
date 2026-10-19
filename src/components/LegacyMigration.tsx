import { useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { Button, Card } from './ui'
import { mergeBackup } from '../lib/storage'
import { collections } from '../lib/export'

export function LegacyMigration({ refresh }: { refresh: () => Promise<void> }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  if (!isTauri()) return null
  async function migrate() {
    setBusy(true); setMessage('')
    try {
      const legacy = await import('../lib/legacyIndexedDb')
      const source = await legacy.readAll()
      const count = collections.reduce((n, key) => n + source[key].length, 0)
      if (count === 0) { setMessage('No records were found in this desktop WebView’s IndexedDB. For records in a separate browser, export a JSON backup there and import it here.'); return }
      if (!window.confirm(`Found ${count} IndexedDB records in this desktop WebView. Merge them into SQLite by UUID and verify them? The IndexedDB source will remain untouched.`)) return
      const result = await mergeBackup(source) as { imported: number; verified: boolean }
      if (!result.verified) throw new Error('Verification failed')
      await refresh()
      setMessage(`Verified ${result.imported} source records in SQLite. The IndexedDB source remains available.`)
    } catch (error) { setMessage(`Migration stopped: ${error instanceof Error ? error.message : String(error)}. The old store has not been removed.`) }
    finally { setBusy(false) }
  }
  return <Card className="mt-5 p-6"><h2 className="text-lg font-semibold">Move existing IndexedDB records to SQLite</h2><p className="mt-2 text-sm text-slate-400">This checks only the desktop WebView’s own IndexedDB. A different browser profile or origin cannot be read by this app. Open the old web version, export its complete JSON backup, then import it above. Keep that backup until the record counts and values are checked.</p><Button className="mt-4" onClick={migrate} disabled={busy}>{busy ? 'Checking…' : 'Check and migrate this WebView'}</Button>{message && <p role="status" className="mt-3 text-sm text-slate-300">{message}</p>}</Card>
}
