import { buildApp } from './app'
import { config } from './config/env'

const app = await buildApp(config)
try {
  await app.listen({ host: '127.0.0.1', port: config.port })
  console.info(`GoXFinance API ready at http://localhost:${config.port}`)
} catch (error) {
  console.error('Unable to start GoXFinance API:', error instanceof Error ? error.message : 'Unknown startup error')
  process.exitCode = 1
}
