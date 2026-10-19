import { buildApp } from './app'
import { config } from './config/env'
import { acquireDatabaseLease } from './db/runtime-lease'
import { restoreQueuedSnapshot } from './db/sqlite-backups'
import { promptPassphrase } from './db/encryption/passphrase-prompt'
import { plaintext, type DatabaseSecurity } from './db/encryption/sqlite-engine'

let release: (() => void) | undefined
let key: Buffer | undefined
let app: Awaited<ReturnType<typeof buildApp>> | undefined
try {
  key =
    config.databaseEncryption === 'encrypted'
      ? await promptPassphrase('Unlock GoXFinance database')
      : undefined
  const databaseSecurity: DatabaseSecurity = key ? { mode: 'encrypted', key } : plaintext
  release = acquireDatabaseLease(config.databasePath)
  await restoreQueuedSnapshot(config.databasePath, databaseSecurity)
  app = await buildApp({ ...config, databaseSecurity })
  key?.fill(0)
  app.addHook('onClose', async () => release?.())
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void app?.close().finally(() => process.exit())
    })
  await app.listen({ host: '127.0.0.1', port: config.port })
  console.info(`GoXFinance API ready at http://localhost:${config.port}`)
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
}
