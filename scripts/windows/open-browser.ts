import { spawn } from 'node:child_process'
import { localWebsite } from './local-services'

export function openBrowser(origin: string) {
  const { url } = localWebsite(origin)
  return new Promise<void>((resolve, reject) => {
    const opener = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
      stdio: 'ignore',
      windowsHide: true,
    })
    opener.once('error', () =>
      reject(new Error(`Unable to open the browser. Open ${url} manually.`)),
    )
    opener.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Open ${url} in your browser.`)),
    )
  })
}
