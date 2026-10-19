import { useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { Button, Card } from './ui'

export function DatabaseBackups({ refresh }: { refresh: () => Promise<void> }) {
  const [names, setNames] = useState<string[]>([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { if (isTauri()) void invoke<string[]>('list_database_backups').then(setNames).catch(error => setMessage(String(error))) }, [])
  if (!isTauri()) return null
  async function create() { setBusy(true); try { const name = await invoke<string>('create_database_backup'); setNames(await invoke<string[]>('list_database_backups')); setMessage(`Database snapshot created: ${name}`) } catch (error) { setMessage(String(error)) } finally { setBusy(false) } }
  async function restore(name: string) { if (!window.confirm(`Merge ${name} into the current SQLite database? Existing IDs and records will be preserved. The backup file will remain available.`)) return; setBusy(true); try { setMessage(await invoke<string>('merge_database_backup', { name })); await refresh() } catch (error) { setMessage(`Restore failed: ${String(error)}`) } finally { setBusy(false) } }
  return <Card className="mt-5 p-6"><h2 className="text-lg font-semibold">SQLite database snapshots</h2><p className="mt-2 text-sm text-slate-400">Snapshots stay in this app’s OS-specific user directory. They are unencrypted; use an encrypted JSON export for a portable protected copy. Restore merges by UUID and validates database integrity and foreign keys.</p><Button className="mt-4" onClick={create} disabled={busy}>Create SQLite snapshot</Button><div className="mt-4 space-y-2">{names.map(name => <div key={name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 p-3 text-sm"><span>{name}</span><Button size="small" onClick={() => restore(name)} disabled={busy}>Merge snapshot</Button></div>)}{!names.length && <p className="text-sm text-slate-400">No snapshots yet.</p>}</div>{message && <p role="status" className="mt-4 text-sm text-cyan-300">{message}</p>}</Card>
}
