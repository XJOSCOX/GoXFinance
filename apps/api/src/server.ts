import { buildApp } from './app'
import { localPlaidRuntime, type PlaidRuntime } from './modules/banking/plaid/plaid.runtime'
import { config } from './config/env'
import { acquireDatabaseLease } from './db/runtime-lease'
import { restoreQueuedSnapshot } from './db/sqlite-backups'
import { startupPassphrase } from './db/encryption/startup-passphrase'
import { plaintext, type DatabaseSecurity } from './db/encryption/sqlite-engine'

let release: (() => void) | undefined
let key: Buffer | undefined
let app: Awaited<ReturnType<typeof buildApp>> | undefined
let closing = false
let plaid: PlaidRuntime | undefined
async function shutdown() {
  if (closing) return
  closing = true
  try {
    await app?.close()
  } finally {
    key?.fill(0)
    release?.()
    process.exit(0)
  }
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void shutdown()
  })
// Private parent/child IPC for the Windows launcher; no HTTP shutdown endpoint.
if (process.send) {
  process.on('message', (message) => {
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'goxfinance:shutdown'
    )
      void shutdown()
  })
  process.once('disconnect', () => {
    void shutdown()
  })
}
try {
  key = config.databaseEncryption === 'encrypted' ? await startupPassphrase() : undefined
  const databaseSecurity: DatabaseSecurity = key ? { mode: 'encrypted', key } : plaintext
  release = acquireDatabaseLease(config.databasePath)
  await restoreQueuedSnapshot(config.databasePath, databaseSecurity)
  plaid = await localPlaidRuntime()
  app = await buildApp({ ...config, databaseSecurity, plaid })
  app.addHook('onClose', async () => {
    if (plaid && 'vault' in plaid) plaid.vault.dispose()
  })
  key?.fill(0)
  app.addHook('onClose', async () => release?.())
  await app.listen({ host: '127.0.0.1', port: config.port })
  console.info(`GoXFinance API ready at http://localhost:${config.port}`)
  if (process.connected) process.send?.({ type: 'goxfinance:ready' }, () => {})
} catch (error) {
  await app?.close()
  release?.()
  console.error(
    'Unable to start GoXFinance API:',
    config.databaseEncryption === 'encrypted'
      ? 'Encrypted database unlock/startup failed; check the file, passphrase and recovery instructions.'
      : error instanceof Error
        ? error.message
        : 'Unknown startup error',
  )
  process.exitCode = 1
} finally {
  key?.fill(0)
  if (!app && plaid && 'vault' in plaid) plaid.vault.dispose()
}
