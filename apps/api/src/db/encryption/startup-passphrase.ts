import { promptPassphrase } from './passphrase-prompt'
import { validateKey } from './sqlite-engine'

/** Backend startup only. Environment values never enter config objects or API responses. */
export async function startupPassphrase(
  environment: NodeJS.ProcessEnv = process.env,
  prompt: () => Promise<Buffer> = () => promptPassphrase('Unlock GoXFinance database'),
): Promise<Buffer> {
  const supplied = environment.DATABASE_PASSPHRASE
  delete environment.DATABASE_PASSPHRASE
  const key =
    supplied === undefined || supplied === '' ? await prompt() : Buffer.from(supplied, 'utf8')
  try {
    validateKey({ mode: 'encrypted', key })
    return key
  } catch {
    key.fill(0)
    throw new Error('Database passphrase must contain 16–1024 UTF-8 bytes')
  }
}
