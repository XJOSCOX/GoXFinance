import { buildApp } from './app'
import { config } from './config/env'
import { acquireDatabaseLease } from './db/runtime-lease'
import { restoreQueuedSnapshot } from './db/sqlite-backups'

const release = acquireDatabaseLease(config.databasePath)
await restoreQueuedSnapshot(config.databasePath)
const app = await buildApp(config)
app.addHook('onClose', async () => release())
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().finally(() => process.exit()) })
try {
  await app.listen({ host: '127.0.0.1', port: config.port })
  console.info(`GoXFinance API ready at http://localhost:${config.port}`)
} catch (error) {
  console.error('Unable to start GoXFinance API:', error instanceof Error ? error.message : 'Unknown startup error')
  process.exitCode = 1
}
