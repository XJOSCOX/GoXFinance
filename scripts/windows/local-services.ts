import { connect } from 'node:net'
import { readFileSync } from 'node:fs'

export function localWebsite(origin: string) {
  const url = new URL(origin)
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Windows launcher requires a local HTTP FRONTEND_ORIGIN with no path or credentials.',
    )
  return {
    url: url.origin,
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: Number(url.port || 80),
  }
}

export function portOpen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = connect({ port, host })
    const finish = (open: boolean) => {
      socket.destroy()
      resolve(open)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED') finish(false)
      else {
        socket.destroy()
        reject(new Error(`Unable to inspect local port ${port}. Check local network permissions.`))
      }
    })
    socket.setTimeout(1000, () => {
      socket.destroy()
      reject(new Error(`Local port ${port} did not respond. Nothing was stopped.`))
    })
  })
}

export async function signInEndpointReady(origin: string) {
  try {
    const response = await fetch(`${origin}/api/auth/me`, {
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
    })
    if (
      response.status !== 401 ||
      !response.headers.get('content-type')?.includes('application/json')
    )
      return false
    const body = (await response.json()) as { error?: string }
    return body.error === 'Sign in required'
  } catch {
    return false
  }
}

export async function existingApiReady(databasePath: string, origin: string) {
  try {
    const pid = Number(readFileSync(databasePath + '.runtime.lock', 'utf8'))
    if (!Number.isSafeInteger(pid) || pid < 1) return false
    process.kill(pid, 0)
    return await signInEndpointReady(origin)
  } catch {
    return false
  }
}

export async function websiteReady(origin: string) {
  try {
    const response = await fetch(origin, { signal: AbortSignal.timeout(3000), redirect: 'error' })
    return (
      response.ok &&
      Boolean(response.headers.get('content-type')?.includes('text/html')) &&
      (await response.text()).includes('<title>GoXFinance')
    )
  } catch {
    return false
  }
}
