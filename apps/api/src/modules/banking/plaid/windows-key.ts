import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
/** Key bytes travel over private stdin/stdout pipes, never process arguments or environment variables. */
function dpapi(bytes: Buffer, protect: boolean): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const command = `Add-Type -AssemblyName System.Security; try { $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::${protect ? 'Protect' : 'Unprotect'}($b,[Text.Encoding]::UTF8.GetBytes('GoXFinance-Plaid-key-v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r)); [Array]::Clear($b,0,$b.Length); [Array]::Clear($r,0,$r.Length) } catch { exit 1 }`
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = '',
      settled = false
    const timer = setTimeout(() => {
      child.kill()
      finish(new Error('Protected key storage unavailable'))
    }, 15000)
    function finish(error?: Error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(Buffer.from(output.trim(), 'base64'))
      output = ''
    }
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
      if (output.length > 16384) {
        child.kill()
        finish(new Error('Protected key storage unavailable'))
      }
    })
    child.stderr.resume()
    child.stdin.on('error', () => finish(new Error('Protected key storage unavailable')))
    child.on('error', () => finish(new Error('Protected key storage unavailable')))
    child.on('exit', (code) =>
      finish(code === 0 ? undefined : new Error('Protected key storage unavailable')),
    )
    child.stdin.end(bytes.toString('base64'))
  })
}
export async function windowsTokenKey(testDirectory?: string) {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA)
    throw new Error('Windows protected key storage is required')
  const folder = testDirectory ?? join(process.env.LOCALAPPDATA, 'GoXFinance', 'keys'),
    path = join(folder, 'plaid-token-key.dpapi')
  await mkdir(folder, { recursive: true })
  let wrapped: Buffer
  try {
    wrapped = await readFile(path)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error('Protected key storage unavailable')
    const key = randomBytes(32)
    try {
      const candidate = await dpapi(key, true)
      try {
        await writeFile(path, candidate, { flag: 'wx', mode: 0o600 })
      } catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError
      }
    } finally {
      key.fill(0)
    }
    wrapped = await readFile(path)
  }
  if (wrapped.length > 16384) throw new Error('Invalid protected key')
  const key = await dpapi(wrapped, false)
  if (key.length !== 32) {
    key.fill(0)
    throw new Error('Invalid protected key')
  }
  return key
}
