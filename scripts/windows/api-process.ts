import { spawn, type ChildProcess } from 'node:child_process'

export function startApi(root: string): { child: ChildProcess; ready: Promise<void> } {
  // The existing prompt reads the console directly. Never pipe or collect passphrase input.
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/server.ts'], {
    cwd: root,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    windowsHide: false,
  })
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(new Error('Unlock timed out. Start the launcher again when ready.')),
      15 * 60 * 1000,
    )
    const message = (value: unknown) => {
      if (
        value &&
        typeof value === 'object' &&
        'type' in value &&
        value.type === 'goxfinance:ready'
      )
        finish()
    }
    const exited = () =>
      finish(
        new Error('The encrypted API stopped before startup completed. Check the message above.'),
      )
    const failed = () =>
      finish(new Error('Unable to start the API. Check Node.js and installed dependencies.'))
    function finish(error?: Error) {
      clearTimeout(timeout)
      child.off('message', message)
      child.off('exit', exited)
      child.off('error', failed)
      if (error) reject(error)
      else resolve()
    }
    child.on('message', message)
    child.once('exit', exited)
    child.once('error', failed)
  })
  return { child, ready }
}

export async function stopApi(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.connected) return
  // Request the API's normal close/checkpoint path; do not force-kill a database writer.
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.off('exit', exited)
      console.warn('API is still closing. Keep this window open.')
      resolve()
    }, 10000)
    const exited = () => {
      clearTimeout(timeout)
      resolve()
    }
    child.once('exit', exited)
    child.send({ type: 'goxfinance:shutdown' }, (error) => {
      if (error) exited()
    })
  })
}
