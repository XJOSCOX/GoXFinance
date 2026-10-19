import { buildApp } from './app'
import { config } from './config/env'

const app = await buildApp(config)
try {
  await app.listen({ host: '127.0.0.1', port: config.port })
  console.info(`GoXFinance API ready at http://localhost:${config.port}`)
} catch {
  console.error('Unable to start GoXFinance API')
  process.exitCode = 1
}
