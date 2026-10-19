import { timingSafeEqual } from 'node:crypto'
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { prepareEncryptedConversion } from './convert-database'
import { validateEncryptedFile } from './encrypted-copy'
import { initializeEncryptedDatabase } from './initialize-database'
import { promptPassphrase } from './passphrase-prompt'
import { validateKey, type DatabaseSecurity } from './sqlite-engine'
import { verifyPreparedCandidate } from './candidate-verification'

const secrets: Buffer[] = []
async function unlock(label: string, confirm = false): Promise<DatabaseSecurity> {
  const key = await promptPassphrase(label)
  secrets.push(key)
  const security: DatabaseSecurity = { mode: 'encrypted', key }
  validateKey(security)
  if (confirm) {
    const repeated = await promptPassphrase('Repeat passphrase')
    secrets.push(repeated)
    if (key.length !== repeated.length || !timingSafeEqual(key, repeated))
      throw new Error('Passphrases do not match')
  }
  return security
}
try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      destination: { type: 'string' },
      source: { type: 'string' },
      recovery: { type: 'string' },
      manifest: { type: 'string' },
      report: { type: 'string' },
      'source-encrypted': { type: 'boolean', default: false },
    },
  })
  if (positionals.length !== 1 || (!values.destination && positionals[0] !== 'rehearse'))
    throw new Error(
      'Specify initialize, prepare, verify with --destination, or rehearse with --manifest and --report',
    )
  const [action] = positionals,
    destination = values.destination ? resolve(values.destination) : ''
  if (action === 'initialize') {
    const security = await unlock('New database passphrase (16–1024 UTF-8 bytes)', true)
    initializeEncryptedDatabase(destination, security)
    console.info(
      'New encrypted database initialized and independently verified. Existing databases were not modified.',
    )
  } else if (action === 'prepare') {
    if (!values.source || !values.recovery)
      throw new Error('Prepare requires --source and --recovery')
    const security = await unlock('New destination and recovery passphrase', true)
    const sourceSecurity = values['source-encrypted']
      ? await unlock('Existing source passphrase')
      : undefined
    prepareEncryptedConversion(
      resolve(values.source),
      resolve(values.recovery),
      destination,
      security,
      sourceSecurity,
    )
    console.info(
      'Encrypted recovery and candidate verified. Original retained. No cutover performed. Explicit authorization is still required before changing runtime configuration.',
    )
  } else if (action === 'verify') {
    validateEncryptedFile(destination, await unlock('Database passphrase'))
    console.info('Encrypted database integrity verified with an independent connection.')
  } else if (action === 'rehearse') {
    if (!values.manifest || !values.report)
      throw new Error('Rehearse requires --manifest and --report')
    await verifyPreparedCandidate(
      resolve(values.manifest),
      resolve(values.report),
      await unlock('Reenter the candidate passphrase from your saved recovery record'),
    )
    console.info(
      'Candidate, backup and disposable restore verified. Local report saved. STOP: explicit approval is required before production cutover.',
    )
  } else throw new Error('Unknown encryption command')
} catch {
  console.error(
    'Encryption operation failed. No automatic cutover or plaintext fallback was attempted. Check command arguments, terminal, passphrase, file permissions and encryption documentation.',
  )
  process.exitCode = 1
} finally {
  for (const secret of secrets) secret.fill(0)
}
