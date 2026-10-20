import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import type { ViteDevServer } from 'vite'
import type { ChildProcess } from 'node:child_process'
import {
  localWebsite,
  portOpen,
  existingApiReady,
  websiteReady,
  signInEndpointReady,
} from './local-services'
import { startApi, stopApi } from './api-process'
import { openBrowser } from './open-browser'

const root = fileURLToPath(new URL('../../', import.meta.url))
process.chdir(root)
let web: ViteDevServer | undefined,
  api: ChildProcess | undefined,
  stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await stopApi(api)
  await web?.close()
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void stop()
  })

try {
  if (process.platform !== 'win32') throw new Error('Use this launcher on Windows.')
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error('Node.js 22 or newer is required.')
  const { config } = await import('../../apps/api/src/config/env')
  if (config.databaseEncryption !== 'encrypted')
    throw new Error(
      'Encrypted mode is not configured. Complete the approved encryption setup first; no plaintext fallback will be used.',
    )
  if (!existsSync(config.databasePath))
    throw new Error(
      'The configured encrypted database is missing. Restore/review the configured path; no replacement database will be created.',
    )
  const website = localWebsite(config.frontendOrigin),
    apiOrigin = `http://127.0.0.1:${config.port}`
  if (website.port === config.port) throw new Error('API and website must use different ports.')
  const apiBusy = await portOpen(config.port, '127.0.0.1')
  if (apiBusy && !(await existingApiReady(config.databasePath, apiOrigin)))
    throw new Error(`Port ${config.port} is occupied by another service. Nothing was stopped.`)
  const webBusy = await portOpen(website.port, website.host)
  if (webBusy && !(await websiteReady(website.url)))
    throw new Error(`Port ${website.port} is occupied by another website. Nothing was stopped.`)
  if (stopping) throw new Error('Startup cancelled.')
  if (!webBusy) {
    const { createServer } = await import('vite')
    web = await createServer({
      root: resolve(root, 'apps/web'),
      configFile: resolve(root, 'apps/web/vite.config.ts'),
      server: {
        host: website.host,
        port: website.port,
        strictPort: true,
        proxy: { '/api': apiOrigin },
      },
    })
    if (stopping) {
      await web.close()
      throw new Error('Startup cancelled.')
    }
    await web.listen()
  }
  if (stopping) {
    await web?.close()
    throw new Error('Startup cancelled.')
  }
  if (!apiBusy) {
    console.info(
      process.env.DATABASE_PASSPHRASE
        ? 'Unlocking the encrypted API with the configured environment passphrase.'
        : 'Enter your database passphrase below. Input is hidden and is never saved by the launcher.',
    )
    const started = startApi(root)
    api = started.child
    api.once('exit', () => {
      if (!stopping) {
        process.exitCode = 1
        void stop()
      }
    })
    await started.ready
  }
  if (stopping) throw new Error('Startup cancelled.')
  if (!(await signInEndpointReady(website.url)))
    throw new Error('The website cannot reach the API. Check the configured Vite proxy and ports.')
  if (stopping) throw new Error('Startup cancelled.')
  console.info(`GoXFinance ready: ${website.url}`)
  if (!apiBusy || !webBusy)
    console.info('Keep this window open. Press Ctrl+C to stop the services started here safely.')
  else console.info('GoXFinance is already running; reusing the existing services.')
  if (process.env.GOXFINANCE_LAUNCHER_NO_BROWSER !== '1') await openBrowser(website.url)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unable to start GoXFinance.')
  process.exitCode = 1
  await stop()
}
